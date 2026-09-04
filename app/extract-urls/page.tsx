import { ExtractUrlsForm } from '@/app/components/ExtractUrlsForm';

export default function ExtractUrlsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Extract URLs</h1>
        <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">
          Crawls a site (sitemap.xml, or a same-origin crawl if there isn&apos;t one — the same discovery Coverage
          and Content check use), groups the discovered URLs by page type, and downloads one example URL per type
          as a spreadsheet — a detail-page type (property listings, news articles, branch pages, ...) can be
          hundreds of near-identical URLs, so this gives one representative example of each rather than every one.
          No page loads, no comparison — just the URL list, in a shape ready to build a content-map reference
          table from.
        </p>
        <ExtractUrlsForm />
      </div>
    </div>
  );
}
