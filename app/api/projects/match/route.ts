import { NextRequest, NextResponse } from 'next/server';
import { matchProjectByUrl } from '@/lib/projects/matchProject';
import { hostnameOf } from '@/lib/projects/hostname';

/** Auto-suggest lookup for the quick-run box: ?url=<any page url> -> the project that
 * owns that hostname, or `{ project: null, hostname }` so the caller can offer to create
 * one for that hostname. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url query parameter is required' }, { status: 400 });
  }
  const project = await matchProjectByUrl(url);
  return NextResponse.json({ project, hostname: hostnameOf(url) });
}
