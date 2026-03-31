-- Stato prodotto: in lista, acquistato, scartato.
alter table public.wishlist_items
  add column if not exists status text not null default 'active'
  check (status in ('active', 'purchased', 'dismissed'));
