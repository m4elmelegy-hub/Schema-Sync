import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
  UseQueryResult,
  QueryKey,
} from "@tanstack/react-query";
import type { Category, CreateCategoryInput } from "./generated/api.schemas";
import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export const getGetCategoriesUrl = () => `/api/categories`;

export const getCategories = async (options?: RequestInit): Promise<Category[]> =>
  customFetch<Category[]>(getGetCategoriesUrl(), { ...options, method: "GET" });

export const getGetCategoriesQueryKey = () => [`/api/categories`] as const;

export const getGetCategoriesQueryOptions = <
  TData = Awaited<ReturnType<typeof getCategories>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getCategories>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetCategoriesQueryKey();
  const queryFn = ({ signal }: { signal?: AbortSignal }) =>
    getCategories({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getCategories>>, TError, TData
  > & { queryKey: QueryKey };
};

export function useGetCategories<
  TData = Awaited<ReturnType<typeof getCategories>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getCategories>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetCategoriesQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

export const createCategory = async (
  input: CreateCategoryInput,
  options?: RequestInit,
): Promise<Category> =>
  customFetch<Category>(getGetCategoriesUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(input),
  });

export function useCreateCategory<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof createCategory>>,
    TError,
    { data: BodyType<CreateCategoryInput> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}) {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  return useMutation<
    Awaited<ReturnType<typeof createCategory>>,
    TError,
    { data: BodyType<CreateCategoryInput> },
    TContext
  >({
    mutationKey: ["createCategory"],
    mutationFn: ({ data }) => createCategory(data, requestOptions),
    ...mutationOptions,
  });
}

export const updateCategory = async (
  id: number,
  input: CreateCategoryInput,
  options?: RequestInit,
): Promise<Category> =>
  customFetch<Category>(`/api/categories/${id}`, {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(input),
  });

export function useUpdateCategory<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof updateCategory>>,
    TError,
    { id: number; data: BodyType<CreateCategoryInput> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}) {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  return useMutation<
    Awaited<ReturnType<typeof updateCategory>>,
    TError,
    { id: number; data: BodyType<CreateCategoryInput> },
    TContext
  >({
    mutationKey: ["updateCategory"],
    mutationFn: ({ id, data }) => updateCategory(id, data, requestOptions),
    ...mutationOptions,
  });
}

export const deleteCategory = async (id: number, options?: RequestInit): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(`/api/categories/${id}`, { ...options, method: "DELETE" });

export function useDeleteCategory<TError = ErrorType<unknown>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof deleteCategory>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}) {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  return useMutation<
    Awaited<ReturnType<typeof deleteCategory>>,
    TError,
    { id: number },
    TContext
  >({
    mutationKey: ["deleteCategory"],
    mutationFn: ({ id }) => deleteCategory(id, requestOptions),
    ...mutationOptions,
  });
}
