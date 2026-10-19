export interface Category {
  id: number;
  name: string;
  description?: string;
  /** The category is a page of its own: picture, slogan, "как это работает". */
  hero_image?: string;
  slogan?: string;
  intro?: string;
  /** The two shops this category's prices are compared with. */
  compare_label_1?: string;
  compare_label_2?: string;
  created_at?: string;
}

/** A volume / packaging option of one product, with prices of its own. */
export interface ProductVariant {
  id: number;
  label: string;
  price: number;
  has_promo_price?: boolean;
  compare_price_1?: number | null;
  compare_price_2?: number | null;
  is_available?: boolean;
}

export interface ProductImage {
  id: number;
  product_id: number;
  url: string;
  is_main: boolean;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  price: number | null;
  description?: string;
  category_id: number | null;
  subcategory_id?: number | null;
  supplier_id: number | null;
  badge?: string | null;
  image_url?: string | null;
  images?: ProductImage[];
  is_available: boolean;
  product_type?: 'piece' | 'box' | 'subscription';
  box_size?: number | null;
  requires_subscription?: boolean;
  requires_variant?: boolean;
  /** True when the admin set a lower price for promo-code holders. */
  has_promo_price?: boolean;
  compare_price_1?: number | null;
  compare_price_2?: number | null;
  /** When present, the buyer picks one and its price applies. */
  variants?: ProductVariant[];
  is_adult?: boolean;
  pack_quantity?: number | null;
  pack_weight_kg?: number | null;
  is_subscription?: boolean;
  subscription_days?: number | null;
  subscription_category_id?: number | null;
  created_at?: string;
}

export interface Subcategory {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  created_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  delivery_day?: string;
  delivery_note?: string;
  assembly_date?: string;
  contact_phone?: string;
  contact_telegram?: string;
}

export interface MusicTrack {
  id: number;
  title: string;
  artist?: string;
  url: string;
  sort_order: number;
}

export interface User {
  id: number;
  full_name: string;
  phone: string;
  email?: string;
  address: string;
  telegram_username?: string;
  telegram_chat_id?: string;
  is_approved?: boolean;
  is_vip?: boolean;
  is_seller?: boolean;
  is_vip_seller?: boolean;
  is_leader?: boolean;
  leader_can_write?: boolean;
  admin_note?: string;
  created_at?: string;
}

export interface CartItem {
  id: number;
  name: string;
  price: number | null;
  image_url?: string | null;
  qty: number;
  product_type?: 'piece' | 'box' | 'subscription' | string;
  box_size?: number | null;
  subscription_id?: number | null;
  /** Buyer's note for "уточните вариант" products (volume, shade…). */
  variant_comment?: string;
  /** Chosen volume / packaging; one product can sit in the cart once per variant. */
  variant_id?: number | null;
  variant_label?: string;
}

export type OrderStatus = 'new' | 'accepted' | 'processing' | 'shipping' | 'done' | 'cancelled';

export interface OrderItem {
  id?: number;
  name: string;
  qty: number;
  price: number;
  base_price?: number;
  image_url?: string | null;
  variant_comment?: string;
}

export interface Order {
  id: number;
  full_name: string;
  phone: string;
  address: string;
  comment?: string;
  items: string;
  total: number;
  status: OrderStatus;
  promo_code?: string | null;
  discount_amount?: number;
  user_id: number | null;
  created_at?: string;
  can_modify?: boolean;
  is_vip?: boolean;
}

export interface Review {
  id: number;
  user_id: number;
  user_name: string;
  text: string;
  rating: number;
  category_id?: number | null;
  created_at: string;
  /** JSON array of /uploads/... urls as stored by the API. */
  images?: string | string[] | null;
}

export interface Admin {
  id: number;
  username: string;
  display_name?: string;
  password?: string;
  created_at?: string;
}

export interface Subscription {
  id: number;
  category_id: number;
  name: string;
  price: number;
  duration_days: number;
  description?: string;
  image_url?: string | null;
  is_active: boolean;
}

export interface UserSubscription {
  id: number;
  user_id: number;
  subscription_id: number;
  purchased_at: string;
  expires_at: string;
  is_active: boolean;
  name?: string;
  category_id?: number;
  description?: string;
}

export interface SupportTicket {
  id: number;
  user_id: number | null;
  user_name: string;
  subject: string;
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: number;
  ticket_id: number;
  sender_type: 'user' | 'admin' | 'leader';
  sender_name: string;
  text: string;
  created_at: string;
  images?: string | string[] | null;
}

export interface OrderChatMessage {
  id: number;
  order_id: number;
  sender_type: 'user' | 'admin' | 'leader';
  sender_name: string;
  text: string;
  created_at: string;
  images?: string | string[] | null;
}

export interface OrderChatSummary {
  order_id: number;
  status: Order['status'];
  total: number;
  items: string;
  created_at: string;
  last_text: string | null;
  last_sender: 'user' | 'admin' | 'leader' | null;
  last_at: string | null;
  unread: boolean;
}
