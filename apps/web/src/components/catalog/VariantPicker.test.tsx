import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { ProductVariant } from '@ai-commerce/types';
import VariantPicker from './VariantPicker';

it('selects a single active SKU without attributes and clears it when unavailable', async () => {
  const variant: ProductVariant = { id: 'sku-1', sku: 'SELLER-1', price: 749, compareAtPrice: null, currency: 'INR', weightGrams: null, isDefault: true, isActive: true, availableQuantity: 9, attributes: [] };
  const onSelect = vi.fn();
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<VariantPicker variants={[variant]} onSelect={onSelect} />));
  expect(onSelect).toHaveBeenLastCalledWith(variant);
  await act(async () => root.render(<VariantPicker variants={[{ ...variant, isActive: false }]} onSelect={onSelect} />));
  expect(onSelect).toHaveBeenLastCalledWith(null);
  root.unmount();
});
