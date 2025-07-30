import { string_to_date } from './date.js'
//import { Logger } from '$lib/logger'
//import SeriesNews from '$lib/server/models/SeriesNews.model'
import { BookWalkerGlobalMangaBakaSeries } from './bw.types.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { http_request } from './runner.js'
import { readFile } from 'fs/promises'
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

export async function all_authors_page_parse(): Promise<Record<string, any>[]> {
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

export async function all_publishers_page_parse(): Promise<Record<string, any>[]> {
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

export async function all_series_page_parse(): Promise<Record<string, any>[]> {
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
			const series_title_details = clean_series_title(title)
			const title_url_stub = $item.find('a').attr('href')
			const title_url = title_url_stub ? new URL(`https://global.bookwalker.jp${title_url_stub}`) : null
			const series_id = title_url?.pathname ? /\d+/.exec(title_url.pathname) : null
			all_series.push({'title': series_title_details['series_title'], 'url': title_url?.toString(), 'series_id': Number(series_id), 'type': series_type, 'isChapterSeries': series_title_details['is_chapter']})
			
		}
	}
	return all_series
}

export async function new_pending_releases_parge_page($: cheerio.CheerioAPI): Promise<any> {
	// Parse each new release until last_date (TODO: and/or last_title OR no release date)?
	const new_pending_releases: Record<string, any>[] = []
	let run: boolean = true

	const title_list = $('ul.o-tile-list')
	for (const item of title_list.children('li')) {
		const $item = $(item)
		const title = $item.find('.a-tile-ttl').text().trim()
		const title_url_stub = $item.find('.a-tile-ttl a').attr('href')
		const title_url = title_url_stub ? new URL(title_url_stub) : null
		const release_id = normalise_uuid(title_url?.pathname.slice(1, -1))
		const release_date = $item.find('.a-tile-release-date')?.text().replace(' release', '')
		// Not UTC? Using local timezone?
		let release_date_js = release_date ? string_to_date(release_date) : null
		const today = new Date(Date.now())
		// BW pre-release dates don't have a year, check month and add a year as needed
		if (release_date_js && release_date_js.month < today.getMonth()) {
			release_date_js = release_date_js.plus({years: 1})
		}
		if (!release_date) {
			run = false
			break
		} else {
			new_pending_releases.push({'release_id': release_id, 'title': title, 'url': title_url?.toString(), 'release_date': release_date_js?.toJSDate()})
		}
	}
	return {'releases': new_pending_releases, 'next_page': run}
}

export async function new_pending_releases(): Promise<Record<string, any>[]> {
	const all_releases: Record<string, any>[] = []
	let page: number = 0
	let next_page: boolean = true

	// manga
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
			//process.exit(1)
		}
	}
	// Light novel (lazy paste)
	page = 0
	next_page = true
	while (next_page) {
		page += 1
		try {
			const $ = await http_request(`https://global.bookwalker.jp/categories/3/?order=release&np=1&page=${page.toString()}`)
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
			//process.exit(1)
		}
	}
	
	return all_releases
}

export async function bwg_parse_series_json(series_id: number): Promise<Record<string, any>[] | null> {
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
			const series_title_details = clean_series_title(item['seriesName'])
			const title = series_title_details['series_title']
			const book_title = extract_title(title)
			const image_url = `https://rimg.bookwalker.jp/${item['thumbnail_id']}/OWWPXNVne2Og5o9nA6tp3Q__.jpg`
			const book_number = Number(item['series_no'])
			const book_uuid = item['uuid']
			const book_url = 'https://global.bookwalker.jp/de' + book_uuid
			series.push({
				'book_title': book_title,
				'number': book_number,
				'thumbnail': image_url,
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

export async function bwg_parse_book_api(book_ids: string[]): Promise<Record<string, any> | null> {
	// Fecthes book(s) details from API endpoint. API supports multiple UUIDs
	// We expect all are for the same series ID! If not, book is skipped
	// productTypeCode: 1 = eBook
	// categoryId: 1 = , 2 = Manga, 3 = Light Novel
	if (!book_ids) {
		return null
	}
	const url: string = `https://member-app.bookwalker.jp/api/books/updates?fileType=EPUB${book_ids.map(id => `&${id}=0`).join('')}`
	try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

		const series_data: Record<string, any> = {}
		const staff: Record<string, any>[] = []

		// Grab series data from first record
		const title = data[0]['productName']
		const series_title_details = clean_series_title(title)
		let series_title_kana = null
		// Can't trust the 'kana' to have kana...
		const count_non_latin_match = data[0]['seriesNameKana'].match(/[^\x00-\x7F]/g)
		if (count_non_latin_match !== null && count_non_latin_match.length > 0) {
			series_title_kana = data[0]['seriesNameKana'].replace('チャプターシリアルズ', '').replace('チャプターリリース', '')  // chapter release/chapter serials
		}

		series_data['series_id'] = Number(data[0]['seriesId'])
		series_data['is_chapter_series'] = series_title_details['is_chapter']
		series_data['series_title'] = series_title_details['series_title']
		series_data['series_title_ja'] = series_title_kana
		series_data['url'] = 'https://global.bookwalker.jp/series/' + data[0]['seriesId']
		series_data['type'] = data[0]['comicFlag'] ? 'manga' : 'light novel'
		series_data['chapters'] = []
		series_data['volumes'] = []

		for (const item of data) {
			if (item['seriesId'] !== series_data['series_id']) {
				// Different series, ignore
				continue
			}
			const book: Record<string, any> = {}
			const series_title_details = clean_series_title(title)
			const book_title = extract_title(title, series_title_details['series_title'])
			// TODO connect to table to name>ID for authors and publisher
			// Use files for now
			for (const author of item['authors']) {
				let staff_item = null
				switch (author['authorTypeName']) {
					case 'Author':
					case 'By (author)':
					case 'Writer':
					case 'Story':
					case 'Original Work':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'writer'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'writer'})
						break
					case 'Artist':
					case 'Art':
					case 'By (artist)':
					case 'Illustrated by':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'artist'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'writer'})
						break
					case 'Designed by':
					case 'Character Design':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'writer'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'design'})
						break
					case 'Letterer':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'writer'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'letterer'})
						break
					case 'Translated by':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'writer'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'translator'})
						break
					case 'Compiled by':
						staff_item = await author_name_link_to_id(author['authorName'])
						staff.push(staff_item !== null ?
							{...staff_item, 'role': 'writer'} :
							{'id': null, 'name': author['authorName'], 'link': null, 'role': 'complied'})
						break
				}
			}

			book['uuid'] = item['uuid']
			book['title'] = book_title
			book['number'] = Number(item['seriesNo'])
			book['cover'] = item['coverImageUrl']
			book['thumbnail'] = item['thumbnailImageUrl']
			book['url'] = 'https://global.bookwalker.jp/de' + item['uuid']
			book['staff'] = staff
			book['description'] = item['productExplanationDetails']
			book['distributor'] = await pub_name_link_to_id(data[0]['companyName'])

			if (series_title_details['is_chapter']) {
				series_data['chapters'].push(book)
			} else {
				series_data['volumes'].push(book)
			}
		}

    return series_data

  } catch (error) {
    console.error(`Error fetching book ${book_ids.toString()} JSON:`, error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

function clean_series_title(series_title: string): Record<string, any> {
	// The demon regex and I don't have a licence!
	const series_title_main = /^(?<start><[^>]*>\s*)?(?<title>.*?)[,-]?(?:\s*(?<end>\(.*\)|（.*）|chapter.*|manga.*|vol.*?))/i.exec(series_title)
	let series_title_clean: string = ''
	let isChapterSeries: boolean = false
	if (series_title_main && series_title_main.groups) {
		series_title_clean = series_title_main.groups.title
		if (series_title_main.groups.start?.toLowerCase().includes('chapter') || series_title_main.groups.end?.toLowerCase().includes('chapter')) {
			isChapterSeries = true
		}
	}
	return {'series_title': series_title_clean, 'is_chapter': isChapterSeries}
}

function extract_title(book_title: string, series_title: string = '') {
	const book_title_clean = book_title.replace(series_title, '')
	const title_chapter = /(?<=:\s).*?(?=,\s*chapter\s\d+)|(?<=chapter\s\d+:\s)(.*)(?:\s-.*)/i.exec(book_title_clean)
	return title_chapter && title_chapter[1] ? title_chapter[1] : null
}

async function author_name_link_to_id(author_name: string): Promise<Record<string, string> | null> {
	const author_path = new URL('.././data/authors.json', import.meta.url)
	try {
		const authors = JSON.parse(await readFile(author_path, { encoding: 'utf8' }))

		const author = authors.find(
			(author: { author_id: number, author_name: string, author_url: string }) => 
				author.author_name === author_name)

		if (!author) {
			return null
		}

		return {
			id: author.author_id,
			name: author.author_name,
			link: author.author_url
		}
	}
	catch (error) {
		console.log('Failed to load authors.json from ', author_path)
	}
	return null
}

async function pub_name_link_to_id(pub_name: string): Promise<Record<string, string> | null> {
	const pub_path = new URL('.././data/publishers.json', import.meta.url)
	try {
		const publishers = JSON.parse(await readFile(pub_path, { encoding: 'utf8' }))

		const publisher = publishers.find((pub: { publisher_id: number, publisher_name: string, publisher_url: string }) => pub.publisher_name === pub_name);

		if (!publisher) {
			return null
		}

		return {
			id: publisher.publisher_id,
			name: publisher.publisher_name,
			link: publisher.publisher_url
		}
	}
	catch (error) {
		console.log('Failed to load publishers.json from ', pub_path)
	}
	return null
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

export async function bwg_parse_page($: cheerio.CheerioAPI, uuid: string): Promise<BookWalkerGlobalMangaBakaSeries> {
	const is_chapter = $('.detail-book-title .tag-list .tag-chapter, .detail-book-title .tag-list .tag-simulpub')?.[0] ? true : false

	function gen_staff(staff_info: any, role: string) {
		staff_info.children('td').children('a').each((idx: number, staff: any) => {
			const $staff = $(staff)
			const staff_name = $staff.text().trim()
			const staff_href = $staff.attr('href')
			const staff_id = staff_href ? /\d+/.exec(staff_href)?.[0] : null
			if (staff_id) {
				data['staff'].push({
					'id': Number(staff_id),
					'name': staff_name,
					'link': staff_href,
					'role': role,
				})
			}
		})
	}

	const series_data: Record<string, any> = {}
	const series_title_url = $('ul.bread-crumb a[href*="series"]')
	const series_title_text = series_title_url.text()
	const series_id_url = series_title_url.attr('href')
	if (series_id_url) {
		const series_id = /\d+/.exec(series_id_url)
		series_data['series_id'] = series_id && series_id[0] ? Number(series_id[0]) : null
		series_data['url'] = 'https://global.bookwalker.jp/series/' + series_id
	}
	series_data['is_chapter_series'] = is_chapter
	// To link series with chapters and volumes
	const related = $('h3.book-main-title.title-style:contains("Related")')
	if (related && related[0]) {
		const related_href = related.parent().find('a.a-see-more-btn')?.attr('href')
		const related_id = related_href ? /\d+/.exec(related_href)?.[0] : null
		series_data['series_linked_id'] = related_id ? Number(related_id) : null 
	}
	
	// Series title and type
	// Use the title info from the top of the page for type
	const series_title_top_text = $('.detail-book-title').text().trim()
	const series_type_match = /light novel|manga|art book/i.exec(series_title_top_text)
	series_data['type'] = series_type_match && series_type_match[0] ? series_type_match[0].toLowerCase() : null
	const series_title_details = clean_series_title(series_title_top_text)
	series_data['series_title'] = series_title_details['series_title']
	


	const data: Record<string, any> = {}
	data['uuid'] = normalise_uuid(uuid)
	data['url'] = 'https://global.bookwalker.jp/de' + data['uuid']
	data['thumbnail'] = $('div.book-img img').attr('src') // Need to hash to check for "Now printing"?
	data['genres'] = []
	data['staff'] = []

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
				gen_staff($detail, 'writer')
				break
			case 'Artist':
			case 'Art':
			case 'By (artist)':
			case 'Illustrated by':
				gen_staff($detail, 'artist')
				break
			case 'Designed by':
			case 'Character Design':
				gen_staff($detail, 'designer')
				break
			case 'Letterer':
				gen_staff($detail, 'letterer')
				break
			case 'Translated by':
				gen_staff($detail, 'translator')
				break
			case 'Compiled by':
				gen_staff($detail, 'compiled')
				break
			case 'Publisher':
				const pub_link = $detail.children('td').find('a').attr('href')
				const pub_id = pub_link ? /\d+/.exec(pub_link) : null
				data['distributor'] = {'name': null, 'link': null, 'id': null}
				data['distributor']['id'] = pub_id ? Number(pub_id) : null
				data['distributor']['name'] = $detail.children('td').text().trim()
				data['distributor']['link'] = pub_link
				series_data['distributor'] = data['distributor'] // Duplicate to series for Zod (?)
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
				data['chapters_inc'] = [...chap_list.matchAll(/\d+\.\d+|\d+/gm)].map(match => match[0])
				break
		}
	})

	data['description'] = $('p.synopsis-text').text().trim()
	
	if (is_chapter) {
		const series_title_top_text_match = series_title_top_text.match(/(?:.*\schapter\s|.*\s#)(\d+.\d+|\d+)/i)
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['number'] = series_title_top_text_match[1]
		} else {
			data['number'] = '1' // default to 1
		}

		data['title'] = extract_title(series_title_top_text, series_data['series_title'])
	} else {
		const series_title_top_text_match = series_title_top_text.match(/.*\svol.*?\s(\d+)|(\d+)/i)
		// Volume format can be "Volume n" or "Vol. n" or just a number (also within brackets)
		if (series_title_top_text_match && series_title_top_text_match[1]) {
			data['number'] = series_title_top_text_match[1]
		} else if (series_title_top_text_match && series_title_top_text_match[2]) {
			data['number'] = series_title_top_text_match[2]
		} else {
			data['number'] = '1' // default to 1
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
		series_data['chapters'] = [data]
	} else {
		series_data['volumes'] = [data]
	}
	return BookWalkerGlobalMangaBakaSeries.strict().parse(series_data)
}

export async function full_series_data(series_id: number) {
	if (!series_id) {
		console.log('Missing required series ID')
		process.exit(1)
	}
	const data: Record<string, any> = {}
	const series_books = await bwg_parse_series_json(series_id)

	if (series_books === null) {
		console.log('No books found!')
		process.exit(1)
	}

	// Use the first volume/chapter for further info
	if (series_books[0]) {
		const book_info = await bwg_parse_book_api([series_books[0]['uuid']])

		if (book_info !== null) {
			// Make life easier and extract chapter or volume
			
			const book_chap_vol = book_info['is_chapter_series'] ? book_info['chapters'][0] : book_info['volumes'][0]
			data['series_id'] = series_id
			data['series_title'] = book_info['series_title']
			data['series_title_ja'] = book_info['series_title_ja']
			// TODO Some kind of post-process to find the volume series id to link/merge. DB trigger?
			// Page scrape can find this
			data['is_chapter_series'] = book_info['is_chapter_series']
			data['series_linked_id'] = null // This is to link series IDs between chapter and volumes series IDs
			data['url'] = 'https://global.bookwalker.jp/series/' + series_id
			data['type'] = book_info['type']
			data['cover'] = book_chap_vol['cover']
			data['thumbnail'] = book_chap_vol['thumbnail']
			//data['series_title_ja_en'] = book_info[0]['']
			data['staff'] = book_chap_vol['staff']
			data['distributor'] = book_info['distributor']
			// If it's not chapter 1 or volume 1, don't want the description as it won't make sense for series
			data['description'] = book_chap_vol['number'] == 1 ? book_chap_vol['description'] : null

			// Use the last record as chapters are removed once said chapters are within a volume
			if (data['is_chapter_series']) {
				data['chapter_count'] = series_books[series_books.length - 1]['number']
			} else {
				data['volume_count'] = series_books[series_books.length - 1]['number']
			}

			data['chapters'] = []
			data['volumes'] = []
		}
		
	}
	
	// Add the book UUIDs for later retrieval
	for (const book of series_books) {
		if (data['is_chapter_series']) {
			data['chapters'].push({'uuid': book['uuid']})
		} else {
			data['volumes'].push({'uuid': book['uuid']})
		}
	}

	return BookWalkerGlobalMangaBakaSeries.parse(data)
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