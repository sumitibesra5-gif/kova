import React, { useState } from 'react';
import { Film, Image as ImageIcon, MapPin, Upload, X } from 'lucide-react';
import { apiRequest, uploadMediaFile } from '../lib/api';
import type { PostItem, StoryItem } from '../types';

interface CreatePostModalProps {
  open: boolean;
  initialMode?: 'post' | 'reel' | 'story';
  onClose: () => void;
  onCreatedPost: (post: PostItem) => void;
  onCreatedStory: (story: StoryItem) => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  open,
  initialMode = 'post',
  onClose,
  onCreatedPost,
  onCreatedStory,
}) => {
  const [kind, setKind] = useState<'post' | 'reel' | 'story'>(initialMode);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setMediaUrl(uploaded.url);
      setMediaType(uploaded.mediaType);
      if (uploaded.mediaType === 'video' && kind === 'post') {
        setKind('reel');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl) {
      setError('Please upload a photo or video first.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (kind === 'story') {
        const res = await apiRequest<{ story: StoryItem }>('/api/stories', {
          method: 'POST',
          body: JSON.stringify({ mediaUrl, mediaType, caption }),
        });
        onCreatedStory(res.story);
      } else {
        const res = await apiRequest<{ post: PostItem }>('/api/posts', {
          method: 'POST',
          body: JSON.stringify({
            mediaUrl,
            mediaType,
            caption,
            location,
            isReel: kind === 'reel',
            aspectRatio: kind === 'reel' ? '9:16' : '4:3',
          }),
        });
        onCreatedPost(res.post);
      }
      setMediaUrl('');
      setCaption('');
      setLocation('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-post-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#121216] border border-[#24242C] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 id="create-post-title" className="text-lg font-display font-bold text-white">
            Create on Kova
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create dialog"
            className="p-2 rounded-lg text-[#8E8E99] hover:text-white hover:bg-[#1B1B22]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0A0A0C] border border-[#1E1E26] mb-5">
          {(['post', 'reel', 'story'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setKind(tab)}
              className={`py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                kind === tab ? 'bg-[#1D1D24] text-white' : 'text-[#8E8E99] hover:text-white'
              }`}
            >
              {tab === 'story' ? '24h Story' : tab}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#FF385C]/10 border border-[#FF385C]/30 text-xs text-[#FF8A9E]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!mediaUrl ? (
            <label
              htmlFor="media-file-upload"
              className="flex flex-col items-center justify-center h-52 rounded-xl border border-dashed border-[#32323E] hover:border-[#FF385C] bg-[#0A0A0C] cursor-pointer transition-colors px-4 text-center"
            >
              <Upload className="w-7 h-7 text-[#8E8E99] mb-2" />
              <span className="text-sm font-medium text-white">
                {uploading ? 'Uploading media...' : 'Upload photo or video'}
              </span>
              <span className="text-xs text-[#71717A] mt-1">
                JPG, PNG, WebP, MP4, WebM up to 50 MB
              </span>
              <input
                id="media-file-upload"
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-[#0A0A0C] border border-[#24242C] max-h-64 flex items-center justify-center">
              {mediaType === 'video' ? (
                <video src={mediaUrl} controls className="max-h-64 w-full object-contain" />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Upload preview"
                  className="max-h-64 w-full object-contain"
                />
              )}
              <button
                type="button"
                onClick={() => setMediaUrl('')}
                aria-label="Remove uploaded media"
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/75 text-white hover:bg-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <label htmlFor="post-caption" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
              Caption &amp; Hashtags
            </label>
            <textarea
              id="post-caption"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption and add #hashtags..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C] resize-none"
            />
          </div>

          {kind !== 'story' && (
            <div>
              <label htmlFor="post-location" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                Location (optional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
                <input
                  id="post-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Shinjuku, Tokyo"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-[#8E8E99]">
              {mediaType === 'video' ? (
                <>
                  <Film className="w-4 h-4" />
                  <span>Video ready</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>Photo ready</span>
                </>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || uploading || !mediaUrl}
              className="px-5 py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Publishing...' : kind === 'story' ? 'Share Story' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
