-- Verification for 20261121000001_project_settlement_payments.sql.
-- NON-PRODUCTION DATABASE ONLY. Runs inside a transaction and rolls everything back.
-- Run in the SQL editor of a dev/staging project after applying the migration there.
-- Each check raises if the behaviour is wrong; success ends with "ALL CHECKS PASSED".

BEGIN;

DO $$
DECLARE
  v_user uuid := (SELECT id FROM auth.users LIMIT 1);
  v_project uuid := gen_random_uuid();
  v_other_project uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  pay uuid;
  failed boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'needs at least one auth.users row'; END IF;

  INSERT INTO projects (id, owner_user_id, name, target_amount) VALUES
    (v_project, v_user, 'settlement test', 0), (v_other_project, v_user, 'other', 0);
  INSERT INTO project_members (id, project_id, name, share_ratio, display_order) VALUES
    (a, v_project, 'A', 1, 0), (b, v_project, 'B', 1, 1), (c, v_project, 'C', 1, 2);

  -- Valid shapes: member→member, kitty→member, member→kitty.
  INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
    VALUES (v_project, a, b, 'settlement', 100, current_date) RETURNING id INTO pay;
  INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
    VALUES (v_project, NULL, b, 'settlement', 50, current_date);
  INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
    VALUES (v_project, c, NULL, 'settlement', 25, current_date);

  -- Invalid shapes must be rejected.
  failed := false;
  BEGIN
    INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
      VALUES (v_project, NULL, NULL, 'settlement', 10, current_date);
  EXCEPTION WHEN check_violation THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'kitty→kitty settlement was accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
      VALUES (v_project, a, a, 'settlement', 10, current_date);
  EXCEPTION WHEN check_violation THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'self-payment was accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date)
      VALUES (v_project, a, b, 'expense', 10, current_date);
  EXCEPTION WHEN check_violation THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'expense with to_member_id was accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO project_transactions (project_id, member_id, to_member_id, transaction_type, amount, transaction_date, shared_by)
      VALUES (v_project, a, b, 'settlement', 10, current_date, ARRAY[a]);
  EXCEPTION WHEN check_violation THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'settlement with shared_by was accepted'; END IF;

  -- Immutable: any update of a settlement is rejected.
  failed := false;
  BEGIN
    UPDATE project_transactions SET amount = 999 WHERE id = pay;
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'settlement update was accepted'; END IF;

  -- Ordinary expenses are still editable.
  INSERT INTO project_transactions (project_id, member_id, transaction_type, amount, transaction_date)
    VALUES (v_project, a, 'expense', 10, current_date);
  UPDATE project_transactions SET amount = 11 WHERE project_id = v_project AND transaction_type = 'expense';

  -- Member with payments can't be deleted…
  failed := false;
  BEGIN
    DELETE FROM project_members WHERE id = a;
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'member with settlement history was deleted'; END IF;
  IF (SELECT member_id FROM project_transactions WHERE id = pay) IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'payment payer changed';
  END IF;

  -- …but undo (delete the payment) is allowed, and then the member can be deleted.
  DELETE FROM project_transactions WHERE project_id = v_project AND transaction_type = 'settlement'
    AND (member_id = a OR to_member_id = a);
  DELETE FROM project_members WHERE id = a;

  -- A member with no payments in a project is deleted normally.
  INSERT INTO project_members (id, project_id, name, share_ratio, display_order)
    VALUES (gen_random_uuid(), v_other_project, 'Solo', 1, 0);
  DELETE FROM project_members WHERE project_id = v_other_project;

  -- Deleting the whole project still cascades, payments and all.
  DELETE FROM projects WHERE id = v_project;
  IF EXISTS (SELECT 1 FROM project_transactions WHERE project_id = v_project) THEN
    RAISE EXCEPTION 'project delete left transactions behind';
  END IF;

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
