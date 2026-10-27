-- Close a pre-existing leak: public.categories had a live-only policy
--   "read"  FOR SELECT  TO public  USING (true)
-- which let any request — signed in or not (the anon key ships in the app
-- bundle) — read every user's categories. It is not in any migration in this
-- repo; it was found by supabase/tests/household.sql section 4 on 2026-10-27.
--
-- Safe to drop: the remaining policy "own categories" (FOR ALL USING
-- auth.uid() = user_id) already covers every client read and write — they all
-- filter .eq('user_id', userId) — and the Edge Functions that read categories
-- use the service role, which bypasses RLS. The only unfiltered client read,
-- categoriesService.getAll() in src/services/index.ts, is never called.
--
-- Rollback (restores the leak; only if something unexpected breaks):
--   CREATE POLICY "read" ON public.categories FOR SELECT USING (true);

DROP POLICY "read" ON public.categories;
