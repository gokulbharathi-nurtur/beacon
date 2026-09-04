import { notFound } from 'next/navigation';
import { getCategoryBySlug } from '@/lib/eventCategories';
import { SectionSubNav } from '@/app/components/SectionSubNav';

export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if (!cat) {
    notFound();
  }

  return (
    <div>
      <SectionSubNav categorySlug={cat.slug} />
      {children}
    </div>
  );
}
