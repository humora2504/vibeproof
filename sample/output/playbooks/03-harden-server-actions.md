# Server actions and route handlers are public endpoints

A Next.js server action is not private because it is only called from one
form. It compiles to an HTTP endpoint with a stable identifier. Anyone can
call it directly, with any arguments, in any order, at any time.

The same is true of a route handler, an edge function and a Supabase RPC.

## Three checks, every time, in this order

```ts
'use server';
import { createServerClient } from '@/lib/supabase-server';

export async function deleteInvoice(id: string) {
  const supabase = createServerClient();

  // 1. Who is calling? Never trust an id passed in by the caller.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // 2. Is the input the shape you expect?
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('Bad request');

  // 3. Do they own it? Express ownership in the query itself, so the
  //    database enforces it even if this check is ever removed.
  const { error } = await supabase
    .from('invoices').delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error('Not found');
}
```

## Two things that look like checks and are not

Reading the user id from the request body or a header the client controls is
not authentication. Neither is hiding the button: the endpoint stays reachable
whatever the interface shows.

## Why Row Level Security still matters here

Every check above lives in code you can accidentally delete. A policy lives in
the database and applies to every path into it, including the one you write
next month. Use both.
