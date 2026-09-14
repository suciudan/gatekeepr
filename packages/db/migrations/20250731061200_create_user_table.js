exports.up = async knex => {
	return knex.schema.createTable("user", table => {
		table.string("id", 36).notNullable()
		table.text("name").notNullable()
		table.string("email", 255).notNullable()
		table.boolean("emailVerified").notNullable()
		table.text("image")
		table.timestamp("createdAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.timestamp("updatedAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.text("website")
		table.text("apiKey")
		table.integer("rpm").notNullable()
		table.timestamp("rpmNextReset", { useTz: false, precision: 3 }).nullable()
		table.boolean("disabled").nullable()
		table.primary(["id"])
		table.unique(["email"], { indexName: "email" })
	})
}

exports.down = async knex => {
	return knex.schema.dropTableIfExists("user")
}