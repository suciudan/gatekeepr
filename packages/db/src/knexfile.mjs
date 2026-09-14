import path from "path"
import dotenv from "dotenv"

const __dirname = import.meta.dirname

dotenv.config({
    path: [
        ".env",
        ".env.local",
        ".env.prod",
        ".env.production"
    ]
})

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */

export default {
    client: "mysql2",
    connection: {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        database: process.env.MYSQL_DB,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASS
    },
    migrations: {
        tableName: "knex_migrations",
        directory: path.resolve(__dirname, "..", "migrations"),
    }
}
