export type CommentRow = {
  id: string;
  incident_id: string;
  author_id: string;
  content: string;
  created_at: Date;
  updated_at: Date | null;
  deleted_at: Date | null;
};

export type Comment = {
  id: string;
  incidentId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date | null;
};

export function presentComment(row: CommentRow): Comment {
  return {
    id: row.id,
    incidentId: row.incident_id,
    authorId: row.author_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
