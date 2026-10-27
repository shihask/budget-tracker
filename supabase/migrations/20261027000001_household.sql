-- Household — shared finances for two MoneyPlant users. See CLAUDE.md "Household"
-- and supabase/preflight/README.md (dependencies, apply order, recovery).
--
-- Purely additive: six new tables and their functions. Nothing here reads, writes
-- or alters transactions, accounts, categories, settings, Shared Projects or any
-- other existing object. A household ledger never moves a personal balance.
--
-- Access model, in one sentence: every row is reachable only through
-- mp_is_active_household_member(household_id) — an *active* member of an *active*
-- household — so leaving, removal, account deletion and archiving all cut access
-- in one place. households / household_members / household_invites have no write
-- policies at all; they change only through the SECURITY DEFINER RPCs below.
--
-- Account deletion can never delete shared history: household_members.user_id is
-- the only column that references auth.users (ON DELETE SET NULL), every other
-- person reference is a member id, and every FK between household tables is
-- RESTRICT. Nothing in this file deletes a member or a household.
--
-- Plain CREATE (no OR REPLACE / IF NOT EXISTS) on purpose: a name collision with
-- something already in the live database fails the whole migration instead of
-- silently replacing it. Run supabase/preflight/household_preflight.sql first.
--
-- Dependencies outside this file: auth.uid(), auth.users, public.mp_is_guest()
-- (20261016000002_guest_mode.sql), extensions.gen_random_bytes (pgcrypto), and
-- core sha256 / hashtextextended / gen_random_uuid.
--
-- Rollback: supabase/preflight/household_rollback.sql (DESTROYS household data).

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT households_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT households_status      CHECK (status IN ('active', 'archived')),
  CONSTRAINT households_archived_at CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

-- display_name is what the partner sees — typed by the member, never an email.
-- user_id is nullable only so account deletion can SET NULL it (see section 4).
CREATE TABLE public.household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  user_id      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  role         text NOT NULL DEFAULT 'member',
  display_name text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  CONSTRAINT household_members_role         CHECK (role IN ('owner', 'member')),
  CONSTRAINT household_members_status       CHECK (status IN ('active', 'left', 'removed')),
  CONSTRAINT household_members_name_length  CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  CONSTRAINT household_members_active_user  CHECK (status <> 'active' OR user_id IS NOT NULL),
  CONSTRAINT household_members_left_at      CHECK ((status = 'active') = (left_at IS NULL)),
  CONSTRAINT household_members_owner_active CHECK (role = 'member' OR status = 'active'),
  -- Target of the composite FKs that keep every reference inside one household.
  CONSTRAINT household_members_household_id_id UNIQUE (household_id, id)
);
-- One active household per user (MVP rule), and at most one active owner.
CREATE UNIQUE INDEX household_members_one_active_household
  ON public.household_members (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX household_members_one_active_owner
  ON public.household_members (household_id) WHERE status = 'active' AND role = 'owner';

-- Only the sha256 of the token is stored; the raw token is returned once by
-- mp_household_create_invite and never again. "Expired" is derived
-- (expires_at <= now()), so a pending row past its expiry is simply unusable.
CREATE TABLE public.household_invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  token_hash            bytea NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  created_by_member_id  uuid NOT NULL,
  accepted_by_member_id uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  accepted_at           timestamptz,
  revoked_at            timestamptz,
  CONSTRAINT household_invites_token_hash UNIQUE (token_hash),
  CONSTRAINT household_invites_hash_size  CHECK (octet_length(token_hash) = 32),
  CONSTRAINT household_invites_status     CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT household_invites_expiry     CHECK (expires_at > created_at),
  CONSTRAINT household_invites_accepted   CHECK ((status = 'accepted') = (accepted_by_member_id IS NOT NULL AND accepted_at IS NOT NULL)),
  CONSTRAINT household_invites_revoked    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT household_invites_creator FOREIGN KEY (household_id, created_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT,
  CONSTRAINT household_invites_acceptor FOREIGN KEY (household_id, accepted_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX household_invites_one_pending
  ON public.household_invites (household_id) WHERE status = 'pending';

-- The household's own category list. Personal categories are per user and
-- private, so they are never shared or copied. No transfer / card-payment /
-- borrowing / adjustment category is seeded: the household ledger has only
-- income and expense, so transfers and card bills can't be double-counted here.
CREATE TABLE public.household_categories (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  name                 text NOT NULL,
  kind                 text NOT NULL,
  icon                 text NOT NULL DEFAULT 'tag',
  is_archived          boolean NOT NULL DEFAULT false,
  created_by_member_id uuid NOT NULL,
  updated_by_member_id uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_categories_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT household_categories_kind        CHECK (kind IN ('expense', 'income')),
  -- A key string for the client's icon map, never a glyph (CLAUDE.md: no emoji).
  CONSTRAINT household_categories_icon        CHECK (icon ~ '^[a-z0-9-]{1,32}$'),
  CONSTRAINT household_categories_household_id_id_kind UNIQUE (household_id, id, kind),
  CONSTRAINT household_categories_created_by FOREIGN KEY (household_id, created_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT,
  CONSTRAINT household_categories_updated_by FOREIGN KEY (household_id, updated_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX household_categories_unique_name
  ON public.household_categories (household_id, kind, lower(btrim(name)));

-- Composite FKs carry household_id, so a row can only point at a category or a
-- member of its *own* household — a foreign id from another household fails
-- the FK (23503) whatever the client sends. The category FK also carries the
-- kind, so an expense can't use an income category.
CREATE TABLE public.household_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  type                 text NOT NULL,
  amount               numeric(14,2) NOT NULL,
  category_id          uuid,
  description          text,
  txn_date             date NOT NULL,
  paid_by_member_id    uuid NOT NULL,
  created_by_member_id uuid NOT NULL,
  updated_by_member_id uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_transactions_type   CHECK (type IN ('income', 'expense')),
  CONSTRAINT household_transactions_amount CHECK (amount > 0),
  CONSTRAINT household_transactions_description CHECK (description IS NULL OR char_length(description) <= 120),
  CONSTRAINT household_transactions_category FOREIGN KEY (household_id, category_id, type)
    REFERENCES public.household_categories (household_id, id, kind) ON DELETE RESTRICT,
  CONSTRAINT household_transactions_paid_by FOREIGN KEY (household_id, paid_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT,
  CONSTRAINT household_transactions_created_by FOREIGN KEY (household_id, created_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT,
  CONSTRAINT household_transactions_updated_by FOREIGN KEY (household_id, updated_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT
);
CREATE INDEX household_transactions_by_date
  ON public.household_transactions (household_id, txn_date DESC, created_at DESC);

-- category_id NULL = the overall monthly budget. Budgets apply to every
-- calendar month until changed; spend is always derived from expense rows,
-- never stored. category_kind is pinned to 'expense' so the composite FK
-- rejects a budget on an income category.
CREATE TABLE public.household_budgets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES public.households (id) ON DELETE RESTRICT,
  category_id          uuid,
  category_kind        text NOT NULL DEFAULT 'expense',
  monthly_limit        numeric(14,2) NOT NULL,
  created_by_member_id uuid NOT NULL,
  updated_by_member_id uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_budgets_limit CHECK (monthly_limit >= 0),
  CONSTRAINT household_budgets_kind  CHECK (category_kind = 'expense'),
  CONSTRAINT household_budgets_category FOREIGN KEY (household_id, category_id, category_kind)
    REFERENCES public.household_categories (household_id, id, kind) ON DELETE RESTRICT,
  CONSTRAINT household_budgets_created_by FOREIGN KEY (household_id, created_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT,
  CONSTRAINT household_budgets_updated_by FOREIGN KEY (household_id, updated_by_member_id)
    REFERENCES public.household_members (household_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX household_budgets_one_overall
  ON public.household_budgets (household_id) WHERE category_id IS NULL;
CREATE UNIQUE INDEX household_budgets_one_per_category
  ON public.household_budgets (household_id, category_id) WHERE category_id IS NOT NULL;

-- ── 2. The access helper ───────────────────────────────────────────────────
-- SECURITY DEFINER so policies on household_members don't recurse into
-- themselves. It answers only "am I (auth.uid()) an active member of this
-- active household?" — nothing about anyone else.
CREATE FUNCTION public.mp_is_active_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members m
    JOIN public.households h ON h.id = m.household_id
    WHERE m.household_id = p_household_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND h.status = 'active'
  )
$$;

-- ── 3. Write triggers ──────────────────────────────────────────────────────

-- Categories, transactions, budgets: who/when is stamped by the server, never
-- taken from the client. household_id, created_by and created_at can't change.
-- With no auth.uid() (service role / SQL editor recovery) the given values are
-- kept and the NOT NULL + composite FK constraints still apply.
CREATE FUNCTION public.mp_household_stamp_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_member uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id THEN
      RAISE EXCEPTION 'A household record can''t be moved to another household.' USING ERRCODE = 'PT422';
    END IF;
    NEW.created_by_member_id := OLD.created_by_member_id;
    NEW.created_at := OLD.created_at;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT m.id INTO v_member
    FROM public.household_members m
    WHERE m.household_id = NEW.household_id AND m.user_id = v_uid AND m.status = 'active';
    IF v_member IS NULL THEN
      RAISE EXCEPTION 'You''re not a member of this household.' USING ERRCODE = 'PT403';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_member_id := v_member;
      NEW.created_at := now();
    END IF;
    NEW.updated_by_member_id := v_member;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_household_categories_stamp
  BEFORE INSERT OR UPDATE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.mp_household_stamp_write();
CREATE TRIGGER trg_household_transactions_stamp
  BEFORE INSERT OR UPDATE ON public.household_transactions
  FOR EACH ROW EXECUTE FUNCTION public.mp_household_stamp_write();
CREATE TRIGGER trg_household_budgets_stamp
  BEFORE INSERT OR UPDATE ON public.household_budgets
  FOR EACH ROW EXECUTE FUNCTION public.mp_household_stamp_write();

-- Two-member cap, independent of the RPCs: any path that makes a member active
-- (an RPC, or a future one) takes the household row lock and re-counts.
-- Locking first is what makes the count safe under concurrency — a second
-- writer waits, and in READ COMMITTED its count then sees the first one's row.
CREATE FUNCTION public.mp_household_member_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.households h
  WHERE h.id = NEW.household_id AND h.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This household is no longer active.' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM public.household_members m
      WHERE m.household_id = NEW.household_id AND m.status = 'active' AND m.id <> NEW.id) >= 2 THEN
    RAISE EXCEPTION 'A household can have at most two members.' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_household_members_b_cap_insert
  BEFORE INSERT ON public.household_members
  FOR EACH ROW WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.mp_household_member_cap();
CREATE TRIGGER trg_household_members_b_cap_update
  BEFORE UPDATE OF status ON public.household_members
  FOR EACH ROW WHEN (NEW.status = 'active' AND OLD.status <> 'active')
  EXECUTE FUNCTION public.mp_household_member_cap();

-- After any membership exit: revoke invites nobody active stands behind, then
-- promote the remaining member to owner, or archive the household when nobody
-- active is left. Idempotent: an archived household is left alone. Internal —
-- not executable by clients (see grants).
CREATE FUNCTION public.mp_household_settle_after_exit(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_next   uuid;
BEGIN
  SELECT h.status INTO v_status FROM public.households h WHERE h.id = p_household_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN;
  END IF;

  UPDATE public.household_invites i
     SET status = 'revoked', revoked_at = now()
   WHERE i.household_id = p_household_id
     AND i.status = 'pending'
     AND NOT EXISTS (SELECT 1 FROM public.household_members m
                     WHERE m.id = i.created_by_member_id AND m.status = 'active');

  IF NOT EXISTS (SELECT 1 FROM public.household_members m
                 WHERE m.household_id = p_household_id AND m.status = 'active') THEN
    UPDATE public.households
       SET status = 'archived', archived_at = now(), updated_at = now()
     WHERE id = p_household_id;
    UPDATE public.household_invites
       SET status = 'revoked', revoked_at = now()
     WHERE household_id = p_household_id AND status = 'pending';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.household_members m
                 WHERE m.household_id = p_household_id AND m.status = 'active' AND m.role = 'owner') THEN
    SELECT m.id INTO v_next
    FROM public.household_members m
    WHERE m.household_id = p_household_id AND m.status = 'active'
    ORDER BY m.joined_at, m.id
    LIMIT 1;
    UPDATE public.household_members SET role = 'owner' WHERE id = v_next;
  END IF;
END;
$$;

-- ── 4. Account deletion ────────────────────────────────────────────────────
-- Deleting an auth.users row fires the FK's internal RI action, which runs
-- `UPDATE household_members SET user_id = NULL WHERE user_id = <deleted id>`.
-- That is an ordinary UPDATE, so these row triggers fire on it:
--   BEFORE: the member leaves, loses any owner role and their chosen name is
--           erased. Must RETURN NEW and must not touch user_id — skipping the
--           row would make the RI action fail.
--   AFTER:  settle the household — promote the partner, or archive.
-- Both act only on the user_id non-NULL → NULL transition, so the settle
-- function's own UPDATE (promoting the partner) doesn't re-enter them.
CREATE FUNCTION public.mp_household_member_identity_erased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.display_name := 'Former member';
  IF OLD.status = 'active' THEN
    NEW.status  := 'left';
    NEW.role    := 'member';
    NEW.left_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.mp_household_member_after_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.mp_household_settle_after_exit(NEW.household_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_household_members_a_identity_erased
  BEFORE UPDATE OF user_id ON public.household_members
  FOR EACH ROW WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
  EXECUTE FUNCTION public.mp_household_member_identity_erased();
CREATE TRIGGER trg_household_members_after_identity_erased
  AFTER UPDATE OF user_id ON public.household_members
  FOR EACH ROW WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL AND OLD.status = 'active')
  EXECUTE FUNCTION public.mp_household_member_after_exit();

-- ── 5. RPCs ────────────────────────────────────────────────────────────────
-- All SECURITY DEFINER with an empty search_path; each checks auth.uid() and
-- refuses guests itself. Errors are PTxxx (PostgREST maps them to that HTTP
-- status) with user-facing messages. Lock order everywhere:
-- per-user advisory lock → household row → invite row.

-- "Who am I in my household?" — the client never reads household_members.user_id.
CREATE FUNCTION public.mp_household_current()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('household_id', m.household_id, 'member_id', m.id, 'role', m.role)
  FROM public.household_members m
  JOIN public.households h ON h.id = m.household_id
  WHERE m.user_id = auth.uid() AND m.status = 'active' AND h.status = 'active'
$$;

CREATE FUNCTION public.mp_household_create(p_name text, p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_member text := btrim(coalesce(p_display_name, ''));
  v_hid    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Give your household a name (up to 60 characters).' USING ERRCODE = 'PT422';
  END IF;
  IF char_length(v_member) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Enter the name your partner will see (up to 40 characters).' USING ERRCODE = 'PT422';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mp_household_user:' || v_uid::text, 0));
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid AND status = 'active') THEN
    RAISE EXCEPTION 'You''re already in a household. Leave it before creating a new one.' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.households (name) VALUES (v_name) RETURNING id INTO v_hid;
  INSERT INTO public.household_members (household_id, user_id, role, display_name)
    VALUES (v_hid, v_uid, 'owner', v_member);

  -- created_by/updated_by are stamped by trg_household_categories_stamp.
  INSERT INTO public.household_categories (household_id, name, kind, icon)
  SELECT v_hid, s.name, s.kind, s.icon
  FROM (VALUES
    ('Groceries',          'expense', 'shopping-cart'),
    ('Food',               'expense', 'utensils'),
    ('Rent',               'expense', 'home'),
    ('Electricity',        'expense', 'zap'),
    ('Water',              'expense', 'droplet'),
    ('Internet',           'expense', 'wifi'),
    ('Cooking Gas',        'expense', 'flame'),
    ('Household Supplies', 'expense', 'package'),
    ('Subscription',       'expense', 'repeat'),
    ('Fuel',               'expense', 'fuel'),
    ('Medical',            'expense', 'heart-pulse'),
    ('Child Care',         'expense', 'baby'),
    ('Education',          'expense', 'graduation-cap'),
    ('Pet Care',           'expense', 'paw-print'),
    ('Shopping',           'expense', 'shopping-bag'),
    ('Entertainment',      'expense', 'film'),
    ('Gifts',              'expense', 'gift'),
    ('Other Expense',      'expense', 'tag'),
    ('Contribution',       'income',  'hand-coins'),
    ('Salary',             'income',  'wallet'),
    ('Other Income',       'income',  'coins')
  ) AS s(name, kind, icon);

  RETURN v_hid;
END;
$$;

CREATE FUNCTION public.mp_household_rename(p_household_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;
  IF NOT public.mp_is_active_household_member(p_household_id) THEN
    RAISE EXCEPTION 'You''re not a member of this household.' USING ERRCODE = 'PT403';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Give your household a name (up to 60 characters).' USING ERRCODE = 'PT422';
  END IF;
  UPDATE public.households SET name = v_name, updated_at = now() WHERE id = p_household_id;
END;
$$;

-- Returns the raw token exactly once. 32 random bytes → 43 base64url chars.
CREATE FUNCTION public.mp_household_create_invite(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_member  uuid;
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;

  PERFORM 1 FROM public.households WHERE id = p_household_id AND status = 'active' FOR UPDATE;
  IF FOUND THEN
    SELECT m.id INTO v_member
    FROM public.household_members m
    WHERE m.household_id = p_household_id AND m.user_id = v_uid AND m.status = 'active';
  END IF;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'You''re not a member of this household.' USING ERRCODE = 'PT403';
  END IF;
  IF (SELECT count(*) FROM public.household_members
      WHERE household_id = p_household_id AND status = 'active') >= 2 THEN
    RAISE EXCEPTION 'Your household already has two members.' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM public.household_invites
      WHERE household_id = p_household_id AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Too many invite links today. Try again tomorrow.' USING ERRCODE = 'PT429';
  END IF;

  UPDATE public.household_invites
     SET status = 'revoked', revoked_at = now()
   WHERE household_id = p_household_id AND status = 'pending';

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  INSERT INTO public.household_invites (household_id, token_hash, created_by_member_id, expires_at)
    VALUES (p_household_id, sha256(convert_to(v_token, 'UTF8')), v_member, now() + interval '7 days')
    RETURNING id, expires_at INTO v_id, v_expires;

  RETURN jsonb_build_object('invite_id', v_id, 'token', v_token, 'expires_at', v_expires);
END;
$$;

-- Discloses the household name and inviter's display name only for a usable
-- invite. Unknown, malformed, expired, revoked, accepted, archived, inviter
-- gone, household full: all return exactly {"valid": false}.
CREATE FUNCTION public.mp_household_preview_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT i.household_id, i.expires_at, h.name AS household_name, m.display_name AS inviter_name
    INTO r
    FROM public.household_invites i
    JOIN public.households h        ON h.id = i.household_id
    JOIN public.household_members m ON m.id = i.created_by_member_id
   WHERE i.token_hash = sha256(convert_to(p_token, 'UTF8'))
     AND i.status = 'pending'
     AND i.expires_at > now()
     AND h.status = 'active'
     AND m.status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;
  IF (SELECT count(*) FROM public.household_members
      WHERE household_id = r.household_id AND status = 'active') >= 2 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'household_name', r.household_name,
    'inviter_display_name', r.inviter_name,
    'expires_at', r.expires_at,
    'already_member', EXISTS (SELECT 1 FROM public.household_members
                              WHERE household_id = r.household_id AND user_id = v_uid AND status = 'active'),
    'in_other_household', EXISTS (SELECT 1 FROM public.household_members
                                  WHERE user_id = v_uid AND status = 'active' AND household_id <> r.household_id)
  );
END;
$$;

-- Single-use: the invite row is locked and re-checked, then marked accepted in
-- the same transaction. Two concurrent accepts serialise on the household row
-- lock; the second re-reads the invite as 'accepted' and fails generically.
CREATE FUNCTION public.mp_household_accept_invite(p_token text, p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_hash    bytea;
  v_hid     uuid;
  v_inv     record;
  v_member  uuid;
  c_invalid CONSTANT text := 'This invite link is no longer valid. Ask for a new one.';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  IF public.mp_is_guest() THEN
    RAISE EXCEPTION 'guest_not_allowed' USING ERRCODE = 'PT403';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Enter the name your partner will see (up to 40 characters).' USING ERRCODE = 'PT422';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION '%', c_invalid USING ERRCODE = 'PT422';
  END IF;
  v_hash := sha256(convert_to(p_token, 'UTF8'));

  PERFORM pg_advisory_xact_lock(hashtextextended('mp_household_user:' || v_uid::text, 0));

  SELECT household_id INTO v_hid FROM public.household_invites WHERE token_hash = v_hash;
  IF v_hid IS NULL THEN
    RAISE EXCEPTION '%', c_invalid USING ERRCODE = 'PT422';
  END IF;
  PERFORM 1 FROM public.households WHERE id = v_hid FOR UPDATE;
  SELECT * INTO v_inv FROM public.household_invites WHERE token_hash = v_hash FOR UPDATE;

  IF v_inv.status <> 'pending' OR v_inv.expires_at <= now()
     OR NOT EXISTS (SELECT 1 FROM public.households WHERE id = v_hid AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.household_members
                    WHERE id = v_inv.created_by_member_id AND status = 'active') THEN
    RAISE EXCEPTION '%', c_invalid USING ERRCODE = 'PT422';
  END IF;
  -- Covers the inviter opening their own link.
  IF EXISTS (SELECT 1 FROM public.household_members
             WHERE household_id = v_hid AND user_id = v_uid AND status = 'active') THEN
    RAISE EXCEPTION 'You''re already in this household.' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid AND status = 'active') THEN
    RAISE EXCEPTION 'Leave your current household before joining another.' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM public.household_members
      WHERE household_id = v_hid AND status = 'active') >= 2 THEN
    RAISE EXCEPTION '%', c_invalid USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role, display_name)
    VALUES (v_hid, v_uid, 'member', v_name)
    RETURNING id INTO v_member;
  UPDATE public.household_invites
     SET status = 'accepted', accepted_by_member_id = v_member, accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_hid;
END;
$$;

CREATE FUNCTION public.mp_household_revoke_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  SELECT household_id INTO v_hid FROM public.household_invites WHERE id = p_invite_id;
  IF v_hid IS NULL OR NOT public.mp_is_active_household_member(v_hid) THEN
    RAISE EXCEPTION 'Invite not found.' USING ERRCODE = 'PT404';
  END IF;
  UPDATE public.household_invites
     SET status = 'revoked', revoked_at = now()
   WHERE id = p_invite_id AND status = 'pending';
END;
$$;

-- The last active member leaving archives the household (see settle).
CREATE FUNCTION public.mp_household_leave(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  PERFORM 1 FROM public.households WHERE id = p_household_id FOR UPDATE;
  UPDATE public.household_members
     SET status = 'left', role = 'member', left_at = now()
   WHERE household_id = p_household_id AND user_id = v_uid AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You''re not a member of this household.' USING ERRCODE = 'PT403';
  END IF;
  PERFORM public.mp_household_settle_after_exit(p_household_id);
END;
$$;

-- Owner only, never themselves. A non-owner or an unknown id get the same answer.
CREATE FUNCTION public.mp_household_remove_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to continue.' USING ERRCODE = 'PT401';
  END IF;
  SELECT household_id INTO v_hid FROM public.household_members WHERE id = p_member_id;
  IF v_hid IS NOT NULL THEN
    PERFORM 1 FROM public.households WHERE id = v_hid FOR UPDATE;
  END IF;
  IF v_hid IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.household_members m
       JOIN public.households h ON h.id = m.household_id
       WHERE m.household_id = v_hid AND m.user_id = v_uid
         AND m.status = 'active' AND m.role = 'owner' AND h.status = 'active') THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'PT404';
  END IF;

  UPDATE public.household_members
     SET status = 'removed', role = 'member', left_at = now()
   WHERE id = p_member_id AND household_id = v_hid AND status = 'active'
     AND user_id IS DISTINCT FROM v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That member can''t be removed.' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.household_invites
     SET status = 'revoked', revoked_at = now()
   WHERE household_id = v_hid AND status = 'pending';
  PERFORM public.mp_household_settle_after_exit(v_hid);
END;
$$;

-- ── 6. Row level security ──────────────────────────────────────────────────

ALTER TABLE public.households             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_budgets      ENABLE ROW LEVEL SECURITY;

-- Read-only to members; written only by the RPCs above.
CREATE POLICY "Members read their household" ON public.households
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(id));
CREATE POLICY "Members read their household's members" ON public.household_members
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members read their household's invites" ON public.household_invites
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(household_id));

-- Shared records: full read/write for active members of an active household.
CREATE POLICY "Members read household categories" ON public.household_categories
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members add household categories" ON public.household_categories
  FOR INSERT TO authenticated WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members update household categories" ON public.household_categories
  FOR UPDATE TO authenticated USING (public.mp_is_active_household_member(household_id))
  WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members delete household categories" ON public.household_categories
  FOR DELETE TO authenticated USING (public.mp_is_active_household_member(household_id));

CREATE POLICY "Members read household transactions" ON public.household_transactions
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members add household transactions" ON public.household_transactions
  FOR INSERT TO authenticated WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members update household transactions" ON public.household_transactions
  FOR UPDATE TO authenticated USING (public.mp_is_active_household_member(household_id))
  WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members delete household transactions" ON public.household_transactions
  FOR DELETE TO authenticated USING (public.mp_is_active_household_member(household_id));

CREATE POLICY "Members read household budgets" ON public.household_budgets
  FOR SELECT TO authenticated USING (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members add household budgets" ON public.household_budgets
  FOR INSERT TO authenticated WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members update household budgets" ON public.household_budgets
  FOR UPDATE TO authenticated USING (public.mp_is_active_household_member(household_id))
  WITH CHECK (public.mp_is_active_household_member(household_id));
CREATE POLICY "Members delete household budgets" ON public.household_budgets
  FOR DELETE TO authenticated USING (public.mp_is_active_household_member(household_id));

-- Guests can't be members, so the policies above already exclude them; these
-- restrictive policies are defence in depth, same shape as the guest-mode ones.
CREATE POLICY "Guests cannot add household categories" ON public.household_categories
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());
CREATE POLICY "Guests cannot update household categories" ON public.household_categories
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.mp_is_guest());
CREATE POLICY "Guests cannot add household transactions" ON public.household_transactions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());
CREATE POLICY "Guests cannot update household transactions" ON public.household_transactions
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.mp_is_guest());
CREATE POLICY "Guests cannot add household budgets" ON public.household_budgets
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.mp_is_guest());
CREATE POLICY "Guests cannot update household budgets" ON public.household_budgets
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.mp_is_guest());

-- ── 7. Grants ──────────────────────────────────────────────────────────────
-- Supabase's default privileges grant ALL on new tables and functions to anon
-- and authenticated, and PostgreSQL grants EXECUTE on functions to PUBLIC.
-- Start from nothing and grant back only what the client needs. service_role
-- keeps its defaults (it bypasses RLS; used only for the recovery runbook).

REVOKE ALL ON public.households, public.household_members, public.household_invites,
              public.household_categories, public.household_transactions, public.household_budgets
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.households TO authenticated;
-- user_id is withheld: the partner never sees the other member's auth id.
-- The client learns its own member id from mp_household_current().
GRANT SELECT (id, household_id, role, display_name, status, joined_at, left_at)
  ON public.household_members TO authenticated;
-- token_hash is withheld.
GRANT SELECT (id, household_id, status, created_by_member_id, accepted_by_member_id,
              created_at, expires_at, accepted_at, revoked_at)
  ON public.household_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_categories   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_budgets      TO authenticated;

REVOKE ALL ON FUNCTION
  public.mp_is_active_household_member(uuid),
  public.mp_household_stamp_write(),
  public.mp_household_member_cap(),
  public.mp_household_settle_after_exit(uuid),
  public.mp_household_member_identity_erased(),
  public.mp_household_member_after_exit(),
  public.mp_household_current(),
  public.mp_household_create(text, text),
  public.mp_household_rename(uuid, text),
  public.mp_household_create_invite(uuid),
  public.mp_household_preview_invite(text),
  public.mp_household_accept_invite(text, text),
  public.mp_household_revoke_invite(uuid),
  public.mp_household_leave(uuid),
  public.mp_household_remove_member(uuid)
FROM PUBLIC, anon, authenticated;

-- The helper must be executable by the role the policies run as. Trigger
-- functions and settle are never granted: triggers don't check EXECUTE at fire
-- time, and settle is only called from the SECURITY DEFINER functions above.
GRANT EXECUTE ON FUNCTION
  public.mp_is_active_household_member(uuid),
  public.mp_household_current(),
  public.mp_household_create(text, text),
  public.mp_household_rename(uuid, text),
  public.mp_household_create_invite(uuid),
  public.mp_household_preview_invite(text),
  public.mp_household_accept_invite(text, text),
  public.mp_household_revoke_invite(uuid),
  public.mp_household_leave(uuid),
  public.mp_household_remove_member(uuid)
TO authenticated;

COMMIT;
