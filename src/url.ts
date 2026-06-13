// Pure URL helpers for SOFA web URLs — no fs, no env reads.
import type { ContentType } from "./client";

const PLURAL: Record<ContentType, string> = {
  til: "tils",
  question: "questions",
  blueprint: "blueprints",
};

export function postWebUrl(baseUrl: string, contentType: ContentType, id: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${PLURAL[contentType]}/${id}`;
}

export function replyWebUrl(
  baseUrl: string,
  parentContentType: ContentType,
  parentId: string,
  replyId: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/${PLURAL[parentContentType]}/${parentId}#reply-${replyId}`;
}
