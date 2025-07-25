import { z } from 'zod'
import { fa } from 'zod/v4/locales'

function null_array<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).transform((val) => (val.length === 0 ? null : val))
}

const currency = z.object({
	value: z.number(),
	iso_code: z.string(), // ISO 4217
})

const staff = z.object({
	id: z.number().nullish(),
	role: z.string(),
	name: z.string().nullish(),
	link: z.string().url().nullish(),
})

const distributor = z.object({
	id: z.number().nullish(),
	name: z.string().nullish(),
	link: z.string().url().nullish(),
})

const volume = z.object({
	uuid: z.string(),
	url: z.string().url().nullish(),
	cover: z.string().url().nullish(), // OWWPXNVne2Og5o9nA6tp3Q__.jpg all have this filename
	thumbnail: z.string().url().nullish(),
	title: z.string().nullish(),
	staff: null_array(staff).nullish(),
	distributor: distributor.nullish(),
	genres: null_array(z.string()).nullish(),
	maturity_rating: z.string().nullish(), // Have to use "mature" genre tag
	description: z.string().nullish(),
	number: z.string().nullish(),
	date: z.coerce.date().nullish(),
	price: currency.nullish(),
	rating: z.number().nullish(), // 5/5
	pages: z.number().nullish(),
	chapters_inc: null_array(z.string()).nullish(),
})

const chapter = z.object({
	uuid: z.string(),
	url: z.string().url().nullish(),
	cover: z.string().url().nullish(), // OWWPXNVne2Og5o9nA6tp3Q__.jpg all have this filename
	thumbnail: z.string().url().nullish(),
	title: z.string().nullish(),
	staff: null_array(staff).nullish(),
	distributor: distributor.nullish(),
	genres: null_array(z.string()).nullish(),
	maturity_rating: z.string().nullish(), // Have to use "mature" genre tag
	description: z.string().nullish(),
	number: z.string().nullish(),
	date: z.coerce.date().nullish(),
	price: currency.nullish(),
	rating: z.number().nullish(), // 5/5
	pages: z.number().nullish(),
	vscroll: z.boolean().default(false).nullish()
})

export const BookWalkerGlobalMangaBakaSeries = z.object({
	series_id: z.number(),
	is_chapter_series: z.boolean().default(false),
	series_linked_id: z.number().nullish(), // A series can have a volume and chapter series id
	series_title: z.string(),
	series_alt_title: z.string().nullish(), // Alternative Title
	series_title_ja: z.string().nullish(), // Japanese Title, Can have romaji in <span>
	series_title_ja_en: z.string().nullish(),
	url: z.string().url().nullish(),
	type: z.enum(['manga', 'light novel', 'art book']),
	volume_count: z.number().nullish(),
	chapter_count: z.number().nullish(),
	cover: z.string().url().nullish(),
	thumbnail: z.string().url().nullish(),
	staff: null_array(staff).nullish(),
	distributor: distributor,
	genres: null_array(z.string()).nullish(),
	maturity_rating: z.string().nullish(), // Have to use "mature" genre tag
	description: z.string().nullish(),
	volumes: null_array(volume).nullish(),
	chapters: null_array(chapter).nullish(),
})

export type BookWalkerGlobalMangaBakaSeries = z.infer<typeof BookWalkerGlobalMangaBakaSeries>

export const BookWalkerGlobalManga = z
	.object({
		'id': z.number(),
		'gid': z.number(),
		'info': z.object({
			genres: z
				.array(
					z.object({
						$t: z.string(),
						gid: z.number(),
						type: z.string(),
					}),
				)
				.nullish(),

			picture: z
				.array(
					z.object({
						gid: z.number(),
						img: z.array(
							z.object({
								src: z.string(),
								width: z.number(),
								height: z.number(),
							}),
						),
						src: z.string(),
						type: z.string(),
						width: z.number().nullable(),
						height: z.number().nullable(),
					}),
				)
				.nullish(),

			official_website: z
				.array(
					z.object({
						$t: z.string(),
						gid: z.number(),
						href: z.string(),
						lang: z.string(),
						type: z.string(),
					}),
				)
				.nullish(),

			main_title: z
				.object({
					$t: z.coerce.string(),
					gid: z.number(),
					lang: z.string().nullable().default(null),
					type: z.string(),
				})
				.nullish(),

			plot_summary: z
				.object({
					$t: z.string(),
					gid: z.number().nullish(),
					type: z.string(),
				})
				.nullish(),

			number_of_pages: z
				.object({
					$t: z.number(),
					gid: z.number(),
					type: z.string(),
				})
				.nullish(),

			alternative_title: z
				.array(
					z.object({
						$t: z.coerce.string(),
						gid: z.number(),
						lang: z.string(),
						type: z.string(),
					}),
				)
				.nullish(),

			objectionable_content: z
				.object({
					$t: z.string(),
					gid: z.number().nullish(),
					type: z.string(),
				})
				.nullish(),
		}),

		'name': z.coerce.string(),
		'type': z.string(),

		'staff': z
			.array(
				z.object({
					gid: z.number(),
					task: z.array(z.string()),
					person: z.array(z.object({ $t: z.coerce.string(), id: z.number() })),
				}),
			)
			.nullish(),

		'credit': z
			.array(
				z.object({
					gid: z.number(),
					task: z.array(z.string()),
					company: z.array(z.object({ $t: z.string(), id: z.number() })),
				}),
			)
			.nullish(),

		'ratings': z
			.object({
				nb_votes: z.number(),
				weighted_score: z.number(),
			})
			.nullish(),
	})
	.strict()

export type BookWalkerGlobalManga = z.infer<typeof BookWalkerGlobalManga>

/*export const volumeSchema = z.object({
  id: z.number(),
  links: z.array(z.string().url()),
  cover: z.string().url().nullable(), // Changed .nullish() to .nullable() for consistency if it truly means 'can be null'
  title: z.string(),
  writer: z.string(),
  artist: z.string(),
  distributor: distributor, // Using the imported or defined distributor schema/type
  maturity_rating: z.string(),
  description: z.string(),
  isbn10: z.string(),
  isbn13: z.string(),
  sku: z.string(),
  type: z.string().nullable(),
  volume: z.string().nullable(), // Renamed from 'volume' to avoid conflict with the schema name
  date: z.coerce.date(),
  price: z.string().nullable(),
  pages: z.string().nullable(),
})*/
