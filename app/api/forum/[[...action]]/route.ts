import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-client';
import { getAuthenticatedUser, getOrCreateSessionId, getGuestName, setSessionCookie } from '@/lib/auth-middleware';

// Handle multiple forum actions
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action?: string[] }> }
) {
  const params = await context.params;
  const action = params.action?.[0] || 'list';

  try {
    const body = await request.json();

    if (action === 'topics-list') {
      const { subject, chapter, page = 1, limit = 20 } = body;
      const offset = (page - 1) * limit;

      let sql = `
        SELECT id, title, description, subject, chapter, file_path, created_by, created_at, 
               pinned, status, view_count, 
               (SELECT COUNT(*) FROM forum_posts fp WHERE fp.topic_id = ft.id) as post_count
        FROM forum_topics ft
        WHERE 1=1
      `;
      const queryParams: (string | number | null)[] = [];
      let paramIndex = 1;

      if (subject) {
        sql += ` AND subject = $${paramIndex}`;
        queryParams.push(subject);
        paramIndex++;
      }

      if (chapter) {
        sql += ` AND chapter = $${paramIndex}`;
        queryParams.push(chapter);
        paramIndex++;
      }

      sql += ` ORDER BY pinned DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      const result = await query(sql, queryParams);
      return NextResponse.json({ topics: result.rows });
    }

    if (action === 'topic-get') {
      const { topicId } = body;

      await query('UPDATE forum_topics SET view_count = view_count + 1 WHERE id = $1', [topicId]);

      const topicResult = await query('SELECT * FROM forum_topics WHERE id = $1', [topicId]);
      if (topicResult.rows.length === 0) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
      }

      const postsResult = await query(
        `SELECT id, user_id, session_id, guest_name, content, markdown_parsed, created_at, 
                is_edited, edited_at, is_approved, 
                (SELECT COUNT(*) FROM post_replies pr WHERE pr.parent_post_id = fp.id) as reply_count
         FROM forum_posts fp
         WHERE topic_id = $1 AND is_approved = true
         ORDER BY created_at ASC`,
        [topicId]
      );

      return NextResponse.json({ topic: topicResult.rows[0], posts: postsResult.rows });
    }

    if (action === 'topic-create') {
      const { title, description, subject, chapter, file_path } = body;
      const user = await getAuthenticatedUser(request);

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const result = await query(
        `INSERT INTO forum_topics (title, description, subject, chapter, file_path, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, title, created_at`,
        [title, description, subject, chapter, file_path, user.id]
      );

      return NextResponse.json({ topic: result.rows[0] }, { status: 201 });
    }

    if (action === 'post-create') {
      const { topicId, content } = body;
      const user = await getAuthenticatedUser(request);
      const sessionId = getOrCreateSessionId(request);

      if (!topicId || !content) {
        return NextResponse.json({ error: 'Missing topicId or content' }, { status: 400 });
      }

      const isApproved = user ? true : false;
      const guestName = user ? null : getGuestName(sessionId);

      const result = await query(
        `INSERT INTO forum_posts (topic_id, user_id, session_id, guest_name, content, created_at, updated_at, is_approved)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
         RETURNING id, user_id, session_id, guest_name, content, created_at`,
        [topicId, user?.id || null, user ? null : sessionId, guestName, content, isApproved]
      );

      const response = NextResponse.json(
        { post: result.rows[0], requiresApproval: !isApproved },
        { status: 201 }
      );

      setSessionCookie(response, sessionId);
      return response;
    }

    if (action === 'reactions-add') {
      const { postId, reactionType } = body;
      const user = await getAuthenticatedUser(request);
      const sessionId = getOrCreateSessionId(request);

      await query(
        `INSERT INTO post_reactions (post_id, user_id, session_id, reaction_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [postId, user?.id || null, user ? null : sessionId, reactionType]
      );

      const response = NextResponse.json({ ok: true });
      setSessionCookie(response, sessionId);
      return response;
    }

    if (action === 'discussions-get') {
      const { file_path, line_start, line_end } = body;

      const result = await query(
        `SELECT DISTINCT ft.id, ft.title, ft.subject, ft.chapter,
                fp.id as post_id, fp.content, fp.user_id, fp.guest_name, fp.created_at,
                plr.line_start, plr.line_end
         FROM post_line_references plr
         JOIN forum_posts fp ON plr.post_id = fp.id
         JOIN forum_topics ft ON fp.topic_id = ft.id
         WHERE plr.file_path = $1
         AND ((plr.line_start <= $2 AND plr.line_end >= $3) OR 
              (plr.line_start >= $2 AND plr.line_start <= $3) OR
              (plr.line_end >= $2 AND plr.line_end <= $3))
         AND fp.is_approved = true
         ORDER BY ft.created_at DESC`,
        [file_path, line_end, line_start]
      );

      return NextResponse.json({ discussions: result.rows });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[v0] Forum API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST method' }, { status: 405 });
}
