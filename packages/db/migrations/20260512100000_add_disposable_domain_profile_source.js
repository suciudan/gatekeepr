exports.up = async knex => {
	return knex.schema.alterTable("disposable_domain_profile", table => {
		table.string("source", 80).notNullable().defaultTo("source").after("domain")
		table.index(["isDisposable", "source", "domain"], "disposable_domain_profile_active_source")
	})
}

exports.down = async knex => {
	return knex.schema.alterTable("disposable_domain_profile", table => {
		table.dropIndex(["isDisposable", "source", "domain"], "disposable_domain_profile_active_source")
		table.dropColumn("source")
	})
}
