import knex from "knex"

const client = knex({
	client: "mysql2",
	connection: {
		host: process.env.MYSQL_HOST,
		port: process.env.MYSQL_PORT,
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASS,
		database: process.env.MYSQL_DB,
		dateStrings: true
	}
})

export default client