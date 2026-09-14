"use server"

import { headers } from "next/headers"

import knex from "@repo/db/knex"

import { auth } from "@/libs/auth"

export const isUserLoggedIn = async () => {
	const session = await auth.api.getSession({
		headers: await headers()
	})
	if(!session || !session.user) return false
	return session
}

/**
 * Find the user by user ID
 * @param id
 * @returns {Promise<*>}
 */

export const findUserById = async (id) => {
	return knex("user").where({ id }).first()
}