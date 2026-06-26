# GREEN-25 Data Isolation Test Plan

This test plan verifies that Greenlight data is private by default.

## Preconditions

- Apply `supabase/migrations/20260625_green_25_data_isolation.sql` in Supabase.
- Apply `supabase/migrations/20260625_green_25_remove_permissive_asset_policies.sql` in Supabase.
- Use two separate accounts:
  - User A
  - User B
- Use fake/sample photos only until storage buckets are private and signed URLs are implemented.

## Test 0: Confirm no permissive asset policies remain

Run this in Supabase SQL Editor:

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'assets';
```

Expected:
- Only GREEN-25 asset policies should remain.
- There should be no policy named like `Enable read access for all users`.
- There should be no asset policy using `true` as a read condition.

## Test 1: Private assets do not leak between accounts

1. Log in as User A.
2. Add an asset to the Library.
3. Confirm the asset appears for User A.
4. Log out.
5. Log in as User B.
6. Open Library.

Expected:
- User B does not see User A's asset.

## Test 2: Direct asset table select does not leak rows

From the app or Supabase client while authenticated as User B, query:

```ts
await supabase.from('assets').select('*')
```

Expected:
- User B receives only User B assets and project-shared assets.
- User B does not receive User A private assets.

## Test 3: Scene records do not leak between accounts

1. Log in as User A.
2. Create a production.
3. Create a scene with a room photo.
4. Log out.
5. Log in as User B.
6. Open Projects / Productions.

Expected:
- User B does not see User A's production or scene.

## Test 4: Inventory records do not leak between accounts

1. Log in as User A.
2. Add an asset to inventory for User A's production.
3. Log out.
4. Log in as User B.
5. Open Inventory.

Expected:
- User B does not see User A's inventory record.

## Test 5: Scene placements do not leak between accounts

1. Log in as User A.
2. Create a scene and place an asset on the canvas.
3. Save the scene.
4. Log out.
5. Log in as User B.
6. Attempt to access the same scene through normal app navigation.

Expected:
- User B cannot see the project, scene, or placed assets.

## Test 6: Project membership grants access intentionally

1. Log in as User A.
2. Create a production.
3. Add User B to `project_members` for that production.
4. Log in as User B.
5. Open Projects / Productions.

Expected:
- User B can see project-scoped records for that production.
- User B still cannot see User A's private assets that are not attached to the shared project.

## Test 7: Regression check for asset upload

1. Log in as User A.
2. Add a new Library asset.
3. Confirm the asset row has `uploaded_by = User A id`.
4. Confirm the asset appears in Library and Scene Quick Add for User A.

Expected:
- Asset is usable by User A.
- Asset is invisible to unrelated users.

## Known remaining risk

The current app stores public image URLs. RLS prevents other users from discovering those URLs through database reads, but any already-known public URL may remain accessible while the bucket is public.

Before using real production data:

1. Make `assets` and `scene-photos` buckets private.
2. Store storage paths separately from display URLs.
3. Generate signed URLs after checking database access.
