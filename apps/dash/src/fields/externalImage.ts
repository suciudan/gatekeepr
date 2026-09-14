import type { Field, FieldHook } from 'payload'

export function externalImageField(
  name: string,
  label: string,
  options?: {
    hidden?: boolean
    hooks?: {
      beforeChange?: FieldHook[]
    }
    position?: 'sidebar'
  },
): Field {
  return {
    name,
    label,
    type: 'group',
    admin: {
      hidden: options?.hidden,
      position: options?.position,
    },
    hooks: options?.hooks,
    fields: [
      {
        name: 'url',
        type: 'text',
      },
      {
        name: 'alt',
        type: 'text',
      },
      {
        name: 'width',
        type: 'number',
        min: 1,
      },
      {
        name: 'height',
        type: 'number',
        min: 1,
      },
    ],
  }
}
