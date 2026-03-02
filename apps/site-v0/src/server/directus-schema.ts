/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BlockButton {
  id: string;
  sort?: number;
  type?: string;
  page?: Pages;
  post?: Posts;
  label?: string;
  variant?: string;
  button_group?: BlockButtonGroup;
  url?: string;
}

export interface BlockForm {
  id: string;
  form?: Forms;
  headline?: string;
  tagline?: string;
  meta_header_block_form?: any;
}

export interface BlockGallery {
  headline?: string;
  id: string;
  tagline?: string;
  items?: BlockGalleryItems;
  meta_header_block_gallery?: any;
}

export interface BlockGalleryItems {
  id: string;
  block_gallery?: BlockGallery;
  directus_file?: DirectusFiles;
  sort?: number;
}

export interface BlockHero {
  headline?: string;
  id: string;
  image?: DirectusFiles;
  button_group?: BlockButtonGroup;
  description?: string;
  tagline?: string;
  layout?: string;
  meta_divider_block_here?: any;
  meta_header_block_hero?: any;
}

export interface BlockPosts {
  id: string;
  headline?: string;
  collection?: string;
  tagline?: string;
  limit?: number;
  meta_header_block_posts?: any;
}

export interface BlockPricing {
  id: string;
  headline?: string;
  tagline?: string;
  pricing_cards?: BlockPricingCards[];
  meta_header_block_pricing?: any;
}

export interface BlockPricingCards {
  id: string;
  title?: string;
  description?: string;
  price?: string;
  badge?: string;
  features?: any;
  button?: BlockButton;
  pricing?: BlockPricing;
  is_highlighted?: boolean;
  sort?: number;
}

export interface BlockRichtext {
  content?: string;
  headline?: string;
  id: string;
  alignment?: string;
  tagline?: string;
  meta_header_block_richtext?: any;
}

export interface DocsComponents {
  id: string;
  name?: string;
  description?: string;
  props_schema?: any;
  usage_example?: string;
}

export interface DocsGlossary {
  id: string;
  term?: string;
  definition?: string;
  see_also?: any;
}

export interface DocsMigrations {
  id: string;
  from_version?: string;
  to_version?: string;
  title?: string;
  steps?: any;
  breaking_changes?: any;
}

export interface DocsPages {
  id: string;
  section_id?: DocsSections;
  title?: string;
  order?: number;
  description?: string;
  tags?: any;
  prerequisites?: any;
  next_page?: string;
  prev_page?: string;
  toc?: any;
  mdx?: string;
}

export interface DocsSearchIndex {
  id: number;
  page_id?: DocsPages;
  section_id?: string;
  title?: string;
  description?: string;
  keywords?: any;
  headings?: any;
}

export interface DocsSections {
  id: string;
  title?: string;
  order?: number;
  description?: string;
  icon?: string;
  nav_group?: string;
  pages?: any;
}

export interface DocsSnippets {
  id: string;
  title?: string;
  language?: string;
  code?: string;
  tags?: any;
  description?: string;
}

export interface FormFields {
  id: string;
  name?: string;
  type?: string;
  label?: string;
  placeholder?: string;
  help?: string;
  validation?: string;
  width?: string;
  choices?: any;
  form?: Forms;
  sort?: number;
  required?: boolean;
}

export interface Forms {
  id: string;
  on_success?: string;
  sort?: number;
  submit_label?: string;
  success_message?: string;
  title?: string;
  success_redirect_url?: string;
  is_active?: boolean;
  emails?: any;
  meta_tabs?: any;
  meta_header_forms?: any;
  fields?: FormFields[];
  meta_notice_form_fields?: any;
  meta_notice_form_emails?: any;
  submissions?: FormSubmissions[];
  meta_notice_form_responses?: any;
  meta_fields?: any;
  meta_emails?: any;
  meta_submissions?: any;
}

export interface FormSubmissions {
  id: string;
  timestamp?: string;
  form?: Forms;
  values?: FormSubmissionValues[];
  meta_notice_submissions?: any;
  meta_header_form_submissions?: any;
}

export interface FormSubmissionValues {
  id: string;
  form_submission?: FormSubmissions;
  field?: FormFields;
  value?: string;
  sort?: number;
  file?: DirectusFiles;
}

export interface Globals {
  description?: string;
  id: string;
  social_links?: any;
  tagline?: string;
  title?: string;
  url?: string;
  favicon?: DirectusFiles;
  logo?: DirectusFiles;
  openai_api_key?: string;
  directus_url?: string;
  logo_dark_mode?: DirectusFiles;
  accent_color?: string;
  meta_credentials?: any;
  divider_logo?: any;
  meta_divider_globals?: any;
  meta_notice_globals?: any;
  meta_header_globals?: any;
  meta_notice_security?: any;
}

export interface Navigation {
  id: string;
  title?: string;
  is_active?: boolean;
  meta_notice_navigation?: any;
  items?: NavigationItems[];
  meta_header_navigation?: any;
}

export interface NavigationItems {
  id: string;
  navigation?: Navigation;
  page?: Pages;
  parent?: NavigationItems;
  sort?: number;
  title?: string;
  type?: string;
  url?: string;
  post?: Posts;
  children?: NavigationItems[];
}

export interface PageBlocks {
  id: string;
  sort?: number;
  page?: Pages;
  item?: string;
  collection?: string;
  hide_block?: boolean;
  background?: string;
}

export interface Pages {
  id: string;
  sort?: number;
  title?: string;
  permalink?: string;
  status: string;
  published_at?: string;
  seo?: any;
  meta_tabs?: any;
  meta_header_pages?: any;
  meta_divider_content?: any;
  meta_m2a_button?: any;
  blocks?: PageBlocks;
  meta_notice_pagebuilder?: any;
  meta_content?: any;
  meta_seo?: any;
}

export interface Posts {
  content?: string;
  id: string;
  image?: DirectusFiles;
  slug?: string;
  sort?: number;
  status: string;
  title?: string;
  description?: string;
  author?: DirectusUsers;
  published_at?: string;
  seo?: any;
  meta_header_posts?: any;
  meta_tabs?: any;
  meta_divider_info?: any;
  meta_header_image?: any;
  meta_header_content?: any;
  meta_content?: any;
  meta_seo?: any;
}

export interface BlockButtonGroup {
  id: string;
  sort?: number;
  buttons?: BlockButton[];
}

export interface DirectusFiles {
  id: string;
  storage: string;
  filename_disk?: string;
  filename_download: string;
  title?: string;
  type?: string;
  folder?: DirectusFolders;
  uploaded_by?: DirectusUsers;
  created_on: string;
  modified_by?: DirectusUsers;
  modified_on: string;
  charset?: string;
  filesize?: number;
  width?: number;
  height?: number;
  duration?: number;
  embed?: string;
  description?: string;
  location?: string;
  tags?: any;
  metadata?: any;
  focal_point_x?: number;
  focal_point_y?: number;
  tus_id?: string;
  tus_data?: any;
  uploaded_on?: string;
  focal_point_divider?: any;
  storage_divider?: any;
}

export interface DirectusUsers {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  location?: string;
  title?: string;
  description?: string;
  tags?: any;
  avatar?: DirectusFiles;
  language?: string;
  tfa_secret?: string;
  status: string;
  role?: DirectusRoles;
  token?: string;
  last_access?: string;
  last_page?: string;
  provider: string;
  external_identifier?: string;
  auth_data?: any;
  email_notifications?: boolean;
  appearance?: string;
  theme_dark?: string;
  theme_light?: string;
  theme_light_overrides?: any;
  theme_dark_overrides?: any;
  text_direction: string;
  posts?: Posts[];
  preferences_divider?: any;
  theming_divider?: any;
  admin_divider?: any;
  policies?: DirectusAccess[];
}

export interface DirectusFolders {
  id: string;
  name: string;
  parent?: DirectusFolders;
}

export interface DirectusRoles {
  id: string;
  name: string;
  icon: string;
  description?: string;
  parent?: DirectusRoles;
  children?: DirectusRoles[];
  policies?: DirectusAccess[];
  users_group?: any;
  users_divider?: any;
  users?: DirectusUsers[];
}

export interface DirectusAccess {
  id: string;
  role?: DirectusRoles;
  user?: DirectusUsers;
  policy: DirectusPolicies;
  sort?: number;
}

export interface DirectusPolicies {
  id: string;
  name: string;
  icon: string;
  description?: string;
  ip_access?: string[];
  enforce_tfa: boolean;
  admin_access: boolean;
  app_access: boolean;
  permissions?: DirectusPermissions[];
  assigned_to_divider?: any;
  users?: DirectusAccess[];
  roles?: DirectusAccess[];
}

export interface DirectusPermissions {
  id: number;
  collection: string;
  action: string;
  permissions?: any;
  validation?: any;
  presets?: any;
  fields?: string[];
  policy: DirectusPolicies;
}

export interface CmsDirectusSchema {
  docs_pages: DocsPages[];
  posts: Posts[];
}
