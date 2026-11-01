"use server";

import { revalidatePath } from "next/cache";

import { toActionResult, type ActionResult } from "@/server/action-result";
import { requireCreator } from "@/server/auth/viewer";
import { deletePost } from "@/server/services/posts";

export type DeletePostState = ActionResult<void> | null;

/**
 * Löscht einen eigenen Post (weich). `postId` ist nur das Ziel – `deletePost` prüft, dass der Post
 * dem frisch aus der Session geladenen Viewer gehört.
 */
export async function deletePostAction(postId: string, _state: DeletePostState, _formData: FormData): Promise<DeletePostState> {
  void _state;
  void _formData;
  const viewer = await requireCreator();
  const result = await toActionResult(() => deletePost(viewer, postId));
  if (result.ok) {
    revalidatePath("/studio", "layout");
    revalidatePath("/c/[handle]", "page");
    revalidatePath("/feed");
  }
  return result;
}
