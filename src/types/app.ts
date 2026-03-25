export type UserId = 'daniele' | 'letizia'

/** Classe CSS per il segnaposto visivo accanto al testo (es. cerchio colore profilo). */
export interface UserProfile {
  id: UserId
  displayName: string
  textIcon: string
}

export interface GroceryItem {
  id: string
  text: string
  done: boolean
  /** Chi ha aggiunto l’articolo alla lista condivisa. */
  addedBy: UserId
}
