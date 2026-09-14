'use client'

import { useField } from '@payloadcms/ui'

export function BlogPostPrismicIdField() {
  const uidField = useField<string>({ path: 'uid' })

  return (
    <div className="cms-slug-field">
      <label className="cms-slug-field__label" htmlFor="field-uid">
        Slug
      </label>
      <input
        className="cms-slug-field__input"
        id="field-uid"
        onChange={(event) => {
          void uidField.setValue(event.target.value)
        }}
        value={uidField.value || ''}
      />
    </div>
  )
}
