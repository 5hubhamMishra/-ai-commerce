import { fireEvent, render } from '@testing-library/react-native';
import type { ProductVariant } from '@ai-commerce/types';
import VariantPicker from './VariantPicker';

function variant(overrides: Partial<ProductVariant>): ProductVariant {
  return {
    id: 'v1',
    sku: 'SKU1',
    price: 100,
    compareAtPrice: null,
    currency: 'INR',
    weightGrams: null,
    isDefault: true,
    isActive: true,
    availableQuantity: 5,
    attributes: [],
    ...overrides,
  };
}

describe('VariantPicker', () => {
  it('auto-selects and reports a single variant with no attributes to choose', async () => {
    const onSelect = jest.fn();
    const only = variant({ id: 'v1', attributes: [] });

    await render(<VariantPicker variants={[only]} onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledWith(only);
  });

  it('auto-selects a single variant that has attributes and shows them as an inert summary', async () => {
    const onSelect = jest.fn();
    const only = variant({
      id: 'v1',
      attributes: [{ attribute: 'Color', attributeSlug: 'color', value: 'Red', valueSlug: 'red' }],
    });

    const { findByText } = await render(<VariantPicker variants={[only]} onSelect={onSelect} />);

    expect(await findByText('Color: Red')).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith(only);
  });

  it('resolves the matching variant once every attribute group has a selection', async () => {
    const onSelect = jest.fn();
    const red = variant({
      id: 'v-red',
      attributes: [{ attribute: 'Color', attributeSlug: 'color', value: 'Red', valueSlug: 'red' }],
    });
    const blue = variant({
      id: 'v-blue',
      attributes: [{ attribute: 'Color', attributeSlug: 'color', value: 'Blue', valueSlug: 'blue' }],
    });

    const { getByLabelText } = await render(<VariantPicker variants={[red, blue]} onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledWith(null);

    await fireEvent.press(getByLabelText('Color: Blue'));

    expect(onSelect).toHaveBeenLastCalledWith(blue);
  });

  it('ignores inactive variants entirely', async () => {
    const onSelect = jest.fn();
    const inactive = variant({ id: 'v1', isActive: false, attributes: [] });

    await render(<VariantPicker variants={[inactive]} onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
