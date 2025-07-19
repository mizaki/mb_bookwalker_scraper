import { string_to_date } from './date.js'
//import { Logger } from '$lib/logger'
//import SeriesNews from '$lib/server/models/SeriesNews.model'
import { BookWalkerGlobalMangaBakaSeries } from './bw.types.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { http_request } from './runner.js'
//import tracer, { type TraceOptions } from 'dd-trace'
//import { kinds } from 'dd-trace/ext'
//import tags from 'dd-trace/ext/tags'
import type { Job } from 'pg-boss'
import { ja, no, tr } from 'zod/v4/locales'
import { AnyNode } from 'domhandler'
import { number, uuid } from 'zod/v4'
//import parser from 'xml2json'
//import SourceAnimeNewsNetwork from '../models/SourceAnimeNewsNetwork.model'
//import { Queue, QueueClient } from '../queue'

export async function all_authors_page_parse() {
	const all_series: Record<string, any>[] = []

	const $ = await http_request('https://global.bookwalker.jp/authors/')

	const all_letters = $('ul.link-list')
	for (const letter of all_letters) {
		const $letter = $(letter)
	
		for (const item of $letter.children('li')) {
			const $item = $(item)
			const name = $item.text().trim()
			const author_url_stub = $item.find('a').attr('href')
			const author_url = author_url_stub ? new URL(`https://global.bookwalker.jp${author_url_stub}`) : null
			const author_id = author_url?.pathname ? /\d+/.exec(author_url.pathname) : null
			all_series.push({'author_name': name, 'author_url': author_url?.toString(), 'author_id': Number(author_id)})
			
		}
	}
	return all_series
}

export async function all_publishers_page_parse() {
	const all_publishers: Record<string, any>[] = []

	const $ = await http_request('https://global.bookwalker.jp/publishers/')

	const all = $('ul.link-list')
	for (const pub of all.children('li')) {
		const $pub = $(pub)
		const publisher = $pub.text().trim()
		const publisher_url_stub = $pub.find('a').attr('href')
		const publisher_url = publisher_url_stub ? new URL(`https://global.bookwalker.jp${publisher_url_stub}`) : null
		const publisher_id = publisher_url?.pathname ? /\d+/.exec(publisher_url.pathname) : null
		all_publishers.push({'publisher_name': publisher, 'publisher_url': publisher_url?.toString(), 'publisher_id': Number(publisher_id)})
	}

	return all_publishers
}

export async function all_series_page_parse() {
	const all_series: Record<string, any>[] = []

	const $ = await http_request('https://global.bookwalker.jp/series/')

	const all_letters = $('ul.link-list')
	for (const letter of all_letters) {
		const $letter = $(letter)
	
		for (const item of $letter.children('li')) {
			const $item = $(item)
			const title = $item.text().trim()
			if (title.startsWith('[AUDIOBOOK]')) {
				continue
			}
			const series_type_match = /light novel|manga|art book/i.exec(title)
			const series_type = series_type_match && series_type_match[0] ? series_type_match[0].toLowerCase() : 'manga'
			// The demon regex and I don't have a licence!
			const series_title_main = /^(?<start><[^>]*>\s*)?(?<title>.*?)(?:\s*(?<end>\(.*\)|（.*）|chapter.*|manga.*))?$/ig.exec(title)
			let series_title: string = ''
			let isChapterSeries: boolean = false
			if (series_title_main && series_title_main.groups) {
				series_title = series_title_main.groups.title
				// TODO includes case-sensitve?
				if (series_title_main.groups.start?.toLowerCase().includes('chapter') || series_title_main.groups.end?.toLowerCase().includes('chapter')) {
					isChapterSeries = true
				}
			}
			const title_url_stub = $item.find('a').attr('href')
			const title_url = title_url_stub ? new URL(`https://global.bookwalker.jp${title_url_stub}`) : null
			const series_id = title_url?.pathname ? /\d+/.exec(title_url.pathname) : null
			all_series.push({'title': series_title, 'url': title_url?.toString(), 'series_id': Number(series_id), 'type': series_type, 'isChapterSeries': isChapterSeries})
			
		}
	}
	return all_series
}

export async function new_pending_releases_parge_page($: cheerio.CheerioAPI) {
	// Parse each new release until last_date and/or last_title OR no release date
	const new_pending_releases: Record<string, any>[] = []
	let run: boolean = true

	const title_list = $('ul.o-tile-list')
	for (const item of title_list.children('li')) {
		const $item = $(item)
		const title = $item.find('.a-tile-ttl').text().trim()
		const title_url = $item.find('.a-tile-ttl a').attr('href')
		const release_date = $item.find('.a-tile-release-date')?.text().replace(' release', '')
		if (release_date == '') {
			run = false
		} else {
			new_pending_releases.push({'title': title, 'url': title_url, 'release_date': release_date})
		}
	}
	return {'releases': new_pending_releases, 'next_page': run}
}

export async function new_pending_releases() {
	const all_releases: Record<string, any>[] = []
	let page: number = 0
	let next_page: boolean = true

	while (next_page) {
		page += 1
		try {
			const $ = await http_request(`https://global.bookwalker.jp/categories/2/?order=release&np=1&page=${page.toString()}`)
			const parsedData = await new_pending_releases_parge_page($)
			all_releases.push(...parsedData['releases'])
			next_page = parsedData['next_page']
		} catch (error: any) {
			console.error('An error occurred during parsing:')
			if (error instanceof Error) {
				console.error(`Error: ${error.message}`)
			} else {
				console.error(error)
			}
			process.exit(1)
		}
	}
	return all_releases
}

export async function bwg_parse_series_json(series_id: number) {
	// Fecthes all chapters/volumes from the JSON file endpoint
	if (!series_id) {
		return null
	}

	const series: Record<string, any>[] = []
	const url: string = 'https://seriesinfo.bookwalker.jp/series_info_' + series_id.toString() + '_v2.json'
	try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
		for (const item of data['series_info']) {
			if (!item['series_no']) {
				continue
			}
			const title = item['productName']
			const book_title = extract_title(title)
			const image_url = `https://rimg.bookwalker.jp/${item['thumbnail_id']}/OWWPXNVne2Og5o9nA6tp3Q__.jpg`
			const book_number = Number(item['series_no'])
			const book_uuid = item['uuid']
			const book_url = 'https://global.bookwalker.jp/de' + book_uuid
			series.push({
				'book_title': book_title,
				'number': book_number,
				'image': image_url,
				'uuid': book_uuid,
				'url': book_url
			})
		}

    return series
  } catch (error) {
    console.error(`Error fetching series ${series_id.toString()} JSON:`, error instanceof Error ? error.message : error);
    process.exit(1)
  }
}

export async function bwg_parse_book_api(book_id: string) {
	// Fecthes book(s) details from API endpoint. API supports multiple UUIDs
	// productTypeCode: 1 = eBook
	// categoryId: 1 = , 2 = Manga, 3 = Light Novel
	if (!book_id) {
		return null
	}

	const book: Record<string, any>[] = []
	const url: string = `https://member-app.bookwalker.jp/api/books/updates?fileType=EPUB&${book_id}=0`
	try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
		for (const item of data) {
			const title = item['productName']
			const series_title = item['seriesName']
			const series_id = item['seriesId']
			const book_title = extract_title(title, series_title)
			const image_thumb_url = item['thumbnailImageUrl']
			const image_url = item['coverImageUrl']
			const book_number = Number(item['seriesNo'])
			const book_uuid = item['uuid']
			const book_url = 'https://global.bookwalker.jp/de' + book_uuid
			const publisher = item['companyName']
			const description = item['productExplanationDetails']
			const type = item['comicFlag'] ? 'manga' : 'light novel'

			const authors: Record<string, string> = {}
			for (const author of item['authors']) {
				switch (author['authorTypeName']) {
					case 'Author':
					case 'By (author)':
					case 'Writer':
					case 'Story':
					case 'Original Work':
						authors['writer'] = author['authorName']
						break
					case 'Artist':
					case 'Art':
					case 'By (artist)':
					case 'Illustrated by':
						authors['artist'] = author['authorName']
						break
					case 'Designed by':
					case 'Character Design':
						authors['design'] = author['authorName']
						break
					case 'Letterer':
						authors['letterer'] = author['authorName']
						break
					case 'Translated by':
						authors['translator'] = author['authorName']
						break
					case 'Compiled by':
						authors['compiled'] = author['authorName']
						break
				}
			}
			book.push({
				'book_title': book_title,
				'number': book_number,
				'image': image_url,
				'image_thumb': image_thumb_url,
				'uuid': book_uuid,
				'url': book_url,
				...authors,
				'description': description,
				'series_id': series_id,
				'publisher': publisher,
				'type': type
			})
		}

    return book
  } catch (error) {
    console.error(`Error fetching book ${book_id.toString()} JSON:`, error instanceof Error ? error.message : error);
    process.exit(1)
  }
}

function extract_title(book_title: string, series_title: string = '') {
	const book_title_clean = book_title.replace(series_title, '')
	const title_chapter = /(?<=:\s).*?(?=,\s*chapter\s\d+)|(?<=chapter\s\d+:\s)(.*)(?:\s-.*)/i.exec(book_title_clean)
	return title_chapter && title_chapter[1] ? title_chapter[1] : null
}

function normalise_uuid(uuid: string = ''): string | null {
	// The website adds 'de' to the start of the UUID because...
	if (!uuid) {
		return null
	}

	const uuid_split = uuid.split('-')
	if (uuid_split[0].length == 8) {
		return uuid
	} else {
		if (uuid_split[0].length == 10 && uuid.startsWith('de')) {
			return uuid.slice(2)
		}
	}

	return null
}

export async function bwg_parse_page($: cheerio.CheerioAPI, id: string) {
	const is_chapter = $('.detail-book-title .tag-list .tag-chapter, .tag-simulpub')?.[0] ? true : false

	function gen_staff(staff_info: any) {
		const staffs: Record<string, any>[] = []
		staff_info.children('td').children('a').each((idx: number, staff: any) => {
			const $staff = $(staff)
			const staff_name = $staff.text().trim()
			const staff_href = $staff.attr('href')
			const staff_id = staff_href ? /\d+/.exec(staff_href)?.[0] : null
			if (staff_id) {
				staffs.push({
					'id': Number(staff_id),
					'name': staff_name,
					'link': staff_href,
				})
			}
			})
		if (staffs.length > 0) {
			return staffs
		} else {
			return null
		}
	}

	const series_data: Record<string, any> = {}
	const series_title_url = $('ul.bread-crumb a[href*="series"]')
	const series_title_text = series_title_url.text()
	const series_id_url = series_title_url.attr('href')
	if (series_id_url) {
		const series_id = /\d+/.exec(series_id_url)
		series_data['series_id'] = series_id && series_id[0] ? Number(series_id[0]) : null
	}
	// Series title and type
	// Use the title info from the top of the page for type
	const series_title_top_text = $('.detail-book-title').text().trim()
	const series_type_match = /light novel|manga|art book/i.exec(series_title_top_text)
	series_data['type'] = series_type_match && series_type_match[0] ? series_type_match[0].toLowerCase() : null
	// The demon regex and I don't have a licence!
	const series_title_main = /^(?:<[^>]*>\s*)?(?<title>.*?)(?:\s*(?:\(.*\)|（.*）|chapter.*|manga.*))?$/ig.exec(series_title_text)
	if (series_title_main && series_title_main.groups) {
		series_data['series_title'] = series_title_main.groups.title
	}

	const data: Record<string, any> = {}
	data['id'] = normalise_uuid(id)
	data['url'] = 'https://global.bookwalker.jp/de' + id
	data['cover'] = $('div.book-img img').attr('src') // Need to hash to check for "Now printing"?
	data['genres'] = []
	data['writer'] = []
	data['artist'] = []
	data['design'] = []
	data['letterer'] = []
	data['translator'] = []
	data['compiled'] = []

	const product_detail = $('table.product-detail tbody')

	product_detail.children().each((index, detail) => {
		const $detail = $(detail)
		switch ($detail.children('th').text()) {
			case 'Alternative Title' :
				series_data['series_alt_title'] =  $detail.children('td').text().trim()
				break
			case 'Japanese Title' :
				const ja_title = $detail.children('td').text().trim().replace('\n', '').split('(')
				series_data['series_title_ja'] = ja_title[0] ? ja_title[0].trim() : null
				series_data['series_title_ja_en'] =  ja_title[1] ? ja_title[1].slice(0, -1) : null
				break
			case 'Author':
			case 'By (author)':
			case 'Writer':
			case 'Story':
			case 'Original Work':
				data['writer'] = gen_staff($detail)
				break
			case 'Artist':
			case 'Art':
			case 'By (artist)':
			case 'Illustrated by':
				data['artist'] = gen_staff($detail)
				break
			case 'Designed by':
			case 'Character Design':
				data['design'] = gen_staff($detail)
				break
			case 'Letterer':
				data['letterer'] = gen_staff($detail)
				break
			case 'Translated by':
				data['translator'] = gen_staff($detail)
				break
			case 'Compiled by':
				data['compiled'] = gen_staff($detail)
				break
			case 'Publisher':
				const pub_name = $detail.children('td').text().trim()
				const pub_link = $detail.children('td').find('a').attr('href')
				const pub_id = pub_link ? /\d+/.exec(pub_link) : null
				data['distributor'] = {'name': null, 'link': null, 'id': null}
				data['distributor']['name'] = pub_name
				data['distributor']['link'] = pub_link
				data['distributor']['id'] = pub_id ? Number(pub_id) : null
				break
			case 'Genre':
				const genres: string[] = $detail.children('td').text().trim().replace(/\s\s/g, '').split(',')
				for (let g of genres) {
					g = g.trim()
					if (!(g == 'Manga' || g == 'Light Novels' || g.endsWith('coupon'))) {
						data['genres'].push(g)
						if (g == 'Mature') {
							data['maturity_rating'] = 'Mature'
						}
						if (is_chapter && g == 'V-Scroll Comics') {
							data['vscroll'] = true
						}
					}
				}
				break
			case 'Available since':
				const dates = $detail.children('td').text().trim().split('/')
				data['date'] = string_to_date(dates[0].split('(')[0].trim())
				break
			case 'Page count':
				const pages_string = $detail.children('td').text().trim().split('pages')
				if (pages_string[0]) {
					const pages = Number(pages_string[0])
					data['pages'] = pages > 1 ? pages : null
				}
				break
			case 'Chapters included in this volume':
				const chap_list = $detail.children('td').text().trim()
				data['chapters'] = [...chap_list.matchAll(/\d+\.\d+|\d+/gm)].map(match => match[0])
				break
		}
	})

	data['description'] = $('p.synopsis-text').text().trim()
	
	if (is_chapter) {
		const series_title_top_text_match = series_title_top_text.match(/(?:.*\schapter\s|.*\s#)(\d+.\d+|\d+)/i)
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['chapter'] = series_title_top_text_match[1]
		} else {
			data['chapter'] = 1 // default to 1
		}

		data['title'] = extract_title(series_title_top_text, series_data['series_title'])
	} else {
		const series_title_top_text_match = series_title_top_text.match(/.*\svol.*?\s(\d+)|(\d+)/i) // possible 1.5?
		// Volume format can be "Volume n" or "Vol. n" or just a number
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['volume'] = series_title_top_text_match[1]
		} else if (series_title_top_text_match && series_title_top_text_match[2]) {
			data['volume'] = series_title_top_text_match[2]
		} else {
			data['volume'] = 1 // default to 1
		}

		data['title'] = extract_title(series_title_top_text, series_data['series_title'])
	}
	

	const price = $('.detail-price').text().trim()
	const price_dollar = price? /\d+\.\d+|\d+/.exec(price) : null
	if (price_dollar) {
		data['price'] = {
			'iso_code': 'USD',
			'value': Number(price_dollar),
		}
	}
	
	const stars = $('.star-box').children()
	let star_count = 0
	for (const star of stars) {
		const $star = $(star)
		if ($star.hasClass('ico-star')) {
			star_count += 1
		} else if ($star.hasClass('ico-star_half')) {
			star_count = star_count + 0.5
		}
	}
	data['rating'] = star_count

	if (is_chapter) {
		series_data['chapter'] = data
	} else {
		series_data['volume'] = data
	}
	return BookWalkerGlobalMangaBakaSeries.strict().parse(series_data)
}

/*
export function worker_produce(worker: QueueClient) {
	//const log = Logger.label('ann_news_schedule_refresh')

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.PRODUCER,
			[tags.SPAN_TYPE]: 'worker',
		},
	}

	return tracer.wrap('ann_news_schedule_refresh', options, async () => {
		const rows = await SourceAnimeNewsNetwork.scope('due_for_update').findAll()
		if (rows.length == 0) {
			log.debug('No AnimeNewsNetwork entries due for news refresh')

			return
		}

		for (const row of rows) {
			log.info('AnimeNewsNetwork', row.id, 'will be scheduled for news refresh')

			await update_last_scheduled_at(row)
			await worker.send(Queue.news_ann_work, { id: row.id })
		}
	})
}

export async function worker_consume_batch(jobs: RefreshSeriesNewsPayload) {
	const log = Logger.label('ann_refresh_news_batch')
	log.info('Processing', jobs.length, 'jobs concurrently')

	await Promise.allSettled(
		jobs.map(async (job) => {
			try {
				await worker_consume([job])
				await QueueClient.Worker.boss.complete(Queue.news_ann_work.name, job.id)
			} catch (err) {
				await QueueClient.Worker.boss.fail(Queue.news_ann_work.name, job.id, err as object)
			}
		}),
	)

	log.info('Done processing', jobs.length, 'jobs concurrently')
}

export async function worker_consume([job]: RefreshSeriesNewsPayload) {
	const log = Logger.label(`ann_refresh_news`)

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.CONSUMER,
			[tags.SPAN_TYPE]: 'worker',
			series: job.data,
		},
	}

	await tracer.trace('ann_refresh_news', options, async () => {
		// ! Don't wrap in a big transaction, it can be incredible slow and failing one entry
		// ! would undo all of them

		const row = await SourceAnimeNewsNetwork.findByPk(job.data.id)
		if (!row) {
			log.warn('could not find AnimeNewsNetwork row with ID', job.data.id)
			return
		}

		log.info('Updating AnimeNewsNetwork entry [', row.id, ']')

		await refresh_news(row)
	})
}

function update_last_scheduled_at(row: SourceAnimeNewsNetwork) {
	row.last_scheduled_at = new Date()
	return row.save()
}

export async function worker_consume_discover_new_entries() {
	const log = Logger.label(`worker_consume_discover_new_entries`)

	const resp = await axios.get(`https://www.animenewsnetwork.com/encyclopedia/reports.xml?id=149`)
	const result = parser.toJson(resp.data, { object: true, coerce: true })
	const report = result.report as { item: any[] }

	for (const item of report.item as any[]) {
		const id = item.manga.href.split('?id=')[1]
		if (!id) {
			log.warn('Could not find ID for encyclopedia entry')
			continue
		}

		const [, created] = await SourceAnimeNewsNetwork.findOrCreate({
			where: { id },
		})

		if (created) {
			log.info('Discovered new ANN encyclopedia entry', id)
		}
	}
}
*/