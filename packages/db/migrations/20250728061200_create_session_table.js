exports.up = async knex => {
	return knex.schema.createTable("session", table => {
		table.string("id", 36).notNullable()
		table.timestamp("expiresAt", { useTz: false, precision: 3 }).notNullable()
		table.string("token", 255).notNullable()
		table.timestamp("createdAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.timestamp("updatedAt", { useTz: false, precision: 3 }).notNullable()
		table.text("ipAddress")
		table.text("userAgent")
		table.string("userId", 36).notNullable()
		table.primary(["id"])
		table.unique(["token"], { indexName: "token" })
	})
}

exports.down = async knex => {
	return knex.schema.dropTableIfExists("session")
}