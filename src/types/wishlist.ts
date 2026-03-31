export type WishlistItemStatus = 'active' | 'purchased' | 'dismissed'

export type WishlistItem = {
  id: string
  listId: string
  createdAt: string
  createdBy: 'daniele' | 'letizia'
  status: WishlistItemStatus
  url: string
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
  priceText: string | null
  priceAmount: number | null
  currency: string | null
  notes: string | null
  previewFetchedAt: string | null
  previewNote: string | null
}

export type LinkPreviewPayload = {
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
  priceText: string | null
  priceAmount: number | null
  currency: string | null
  previewNote: string | null
}
