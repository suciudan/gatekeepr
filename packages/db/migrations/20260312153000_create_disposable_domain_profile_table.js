exports.up = async knex => {
	return knex.schema.createTable("disposable_domain_profile", table => {
		table.string("domain", 255).notNullable()
		table.boolean("isDisposable").notNullable().defaultTo(true)
		table.string("firstSeenAt", 30).nullable()
		table.string("lastSeenAt", 30).nullable()
		table.string("removedAt", 30).nullable()
		table.string("lastEnrichedAt", 30).nullable()
		table.text("lastEnrichmentError").nullable()
		table.string("nextEnrichmentAt", 30).nullable()
		table.string("creation", 30).nullable()
		table.string("expiration", 30).nullable()
		table.text("owner").nullable()
		table.text("statusJson").nullable()
		table.text("mxRecordsJson").nullable()
		table.string("nextMxRefreshAt", 30).nullable()
		table.string("mxResolvedAt", 30).nullable()
		table.text("mxResolvedRecordsJson").nullable()
		table.timestamp("createdAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.timestamp("updatedAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.primary(["domain"])
		table.index(["isDisposable", "domain"], "disposable_domain_profile_active_domain")
		table.index(["isDisposable", "nextEnrichmentAt"], "disposable_domain_profile_next_enrichment")
		table.index(["isDisposable", "nextMxRefreshAt"], "disposable_domain_profile_next_mx_refresh")
	})
}

exports.down = async knex => {
	return knex.schema.dropTableIfExists("disposable_domain_profile")
}
