import ProductEditor from '@/components/seller/ProductEditor';
export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  return <ProductEditor id={(await params).id} />;
}
