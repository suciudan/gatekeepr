import type { CollectionConfig } from 'payload'

const mediaStaticDir = process.env.PAYLOAD_MEDIA_DIR || 'media'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Management',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'sourceUrl',
      type: 'text',
      unique: true,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    staticDir: mediaStaticDir,
  },
}
