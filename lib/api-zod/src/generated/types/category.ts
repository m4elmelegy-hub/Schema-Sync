export interface Category {
  id: number;
  name: string;
  company_id: number;
  product_count: number;
}

export interface CreateCategoryInput {
  name: string;
}
