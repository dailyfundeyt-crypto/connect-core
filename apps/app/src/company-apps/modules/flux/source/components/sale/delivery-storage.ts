import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadDeliveryFile(
  client: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/delivery-${Date.now()}.${ext}`;
  const { error } = await client.storage
    .from("purchases")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = client.storage.from("purchases").getPublicUrl(path);
  return data.publicUrl;
}
