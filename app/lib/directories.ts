/**
 * The two saved-record directories (Stage 2A): customers and items. Server only.
 */

import { cleanCustomer, cleanItem } from './invoice/settings';
import { createCustomer, createItem, deleteCustomer, deleteItem, getCustomer, getItem, listCustomers, listItems, updateCustomer, updateItem } from '@/db/directory';

export const CUSTOMERS = {
  key: 'invoice_client_directory' as const,
  noun: 'customer',
  limitMessage: (limit: number) =>
    limit >= 1000
      ? 'You’ve reached the maximum number of saved customers.'
      : `You’ve saved ${limit} customers — the free limit. Saving more than ${limit} customers is part of Pro — coming soon. You can still type any customer straight onto an invoice.`,
  clean: cleanCustomer,
  list: listCustomers,
  get: getCustomer,
  create: createCustomer,
  update: updateCustomer,
  remove: deleteCustomer,
};

export const ITEMS = {
  key: 'invoice_item_catalogue' as const,
  noun: 'item',
  limitMessage: () => 'You’ve reached the maximum number of saved items.',
  clean: cleanItem,
  list: listItems,
  get: getItem,
  create: createItem,
  update: updateItem,
  remove: deleteItem,
};
