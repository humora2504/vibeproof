# Storage buckets: what public really means

A public bucket serves every object to anyone with the URL. No session, no
token, no rate limit that helps you. Object names are guessable more often
than people expect, and URLs end up in shared screenshots and support tickets.

## The rule

Public is correct for assets that would sit on a marketing page anyway: logos,
product images, avatars you are happy to have scraped. Everything else, and
certainly anything a user uploaded about themselves, belongs in a private
bucket served through signed URLs.

## Make a bucket private

```sql
update storage.buckets set public = false where id = 'receipts';
```

Then add policies, because a private bucket with no policy denies everyone
including the owner:

```sql
-- Users may read only their own folder: receipts/<user id>/filename
create policy "read own files"
  on storage.objects for select to authenticated
  using ( bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text );

create policy "write own files"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text );

create policy "delete own files"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text );
```

## Serve the file

```js
// Server side. The link expires; the bucket stays closed.
const { data, error } = await supabase
  .storage.from('receipts')
  .createSignedUrl(`${user.id}/${filename}`, 60); // seconds
```

## Check it

```bash
# Should return 400 or 404, never the file
curl -sI "https://<project>.supabase.co/storage/v1/object/public/receipts/<known-path>"
```
