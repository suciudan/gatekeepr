exports.up = async knex => {
	return knex.schema.createTable("account", table => {
		table.string("id", 36).notNullable()
		table.text("accountId").notNullable()
		table.text("providerId").notNullable()
		table.string("userId", 36).notNullable()
		table.text("accessToken")
		table.text("refreshToken")
		table.text("idToken")
		table.timestamp("accessTokenExpiresAt", { useTz: false, precision: 3 }).nullable()
		table.timestamp("refreshTokenExpiresAt", { useTz: false, precision: 3 }).nullable()
		table.text("scope")
		table.text("password")
		table.timestamp("createdAt", { useTz: false, precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
		table.timestamp("updatedAt", { useTz: false, precision: 3 }).notNullable()
		table.primary(["id"])
	})
}

exports.down = async knex => {
	return knex.schema.dropTableIfExists("account")
}