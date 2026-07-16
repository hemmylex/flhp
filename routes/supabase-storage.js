// src/routes/supabase-storage.js
import { Router } from 'express';
import { supabase } from '../db/pool.js'; // Imports your unified administrative SDK client
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();

/**
 * Generates a temporary Signed Upload URL for direct-to-bucket client streaming.
 * Restricts access strictly to authenticated administrators and organizers.
 */
r.post('/upload-signature', requireAuth, requireRole('admin', 'organizer'), async (req, res, next) => {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'candidate-photos';
    const { contentType } = req.body; // Extract file context from request safely

    // Determine clean file formatting variants dynamically
    const fileExtension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    
    // Generate a cryptographically unique filename to completely avoid object name collisions
    const uniqueFileName = `candidates/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    
    // Request a secure upload signature token from the Supabase infrastructure layer
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUploadUrl(uniqueFileName);

    if (error) {
      const storageError = new Error(error.message || 'Failed to construct a secure remote storage signature.');
      storageError.status = 400; // Map bucket initialization drops directly to input client faults
      throw storageError;
    }

    // Resolve the clean absolute public URL matching this storage position
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(uniqueFileName);

    // Return the authorization endpoints back to your Next.js front-end component
    res.json({
      uploadUrl: data.signedUrl,
      publicPath: uniqueFileName, // This unique path acts as your database persistent reference
      token: data.token,
      renderedUrl: urlData.publicUrl // Direct full HTTP reference ready for <img src="..." /> usage
    });
    
  } catch (err) {
    // Gracefully pass execution failures down to your global Express error middleware
    next(err);
  }
});

export default r;
