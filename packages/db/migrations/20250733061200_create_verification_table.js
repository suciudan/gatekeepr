exports.up = async knex => {
	return knex.schema.createTable("verification", table => {
		table.string("id", 36).notNullable()
		table.text("identifier").notNullable()
		table.text("value").notNullable()
		table.timestamp("expiresAt", { useTz: false, precision: 3 }).notNullable()
		table.timestamp("createdAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.timestamp("updatedAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.primary(["id"])
	})
}

exports.down = async knex => {
	return knex.schema.dropTableIfExists("verification")
}