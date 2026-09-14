'use client'

import { useField } from '@payloadcms/ui'

export function ContentPagePrismicIdField() {
  const uidField = useField<string>({ path: 'uid' })

  return (
    <div className="cms-slug-field">
      <label className="cms-slug-field__label" htmlFor="field-content-page-uid">
        Slug
      </label>
      <input
        className="cms-slug-field__input"
        id="field-content-page-uid"
        onChange={(event) => {
          void uidField.setValue(event.target.value)
        }}
        value={uidField.value || ''}
      />
    </div>
  )
}
