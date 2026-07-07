import { NextRequest, NextResponse } from 'next/server';
import { renderMarkdown } from '@/lib/markdown-renderer';
import DOMPurify from 'isomorphic-dompurify';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action?: string[] }> }
) {
  const params = await context.params;
  const action = params.action?.[0] || 'render';

  try {
    const body = await request.json();

    if (action === 'render' || action === 'validate') {
      const { content } = body;
      if (!content) {
        return NextResponse.json({ error: 'Content required' }, { status: 400 });
      }

      const rendered = renderMarkdown(content);
      const sanitized = DOMPurify.sanitize(rendered);

      return NextResponse.json({
        html: sanitized,
        valid: true,
        wordCount: content.split(/\s+/).length,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[v0] Markdown API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST method' }, { status: 405 });
}
