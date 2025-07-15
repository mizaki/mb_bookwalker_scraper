import { bwg_parse_page } from './bw.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFile } from 'fs/promises';
import { URLSearchParams } from 'url'; // Node.js built-in module
import { tr } from 'zod/v4/locales';

async function saveJsonToFileAsync(data: any, path: string) {
  try {
    const jsonString = JSON.stringify(data, null, 2);

    await writeFile(path, jsonString, 'utf8');
    console.log(`JSON data successfully saved to ${path} (async).`);
  } catch (error) {
    console.error(`Error saving JSON data to ${path} (async):`, error);
  }
}

async function runParser(id: string, isVolume: boolean = true): Promise<void> {
    if (!id) {
        console.error('Usage: ts-node activate_parser.ts <ID>');
        process.exit(1);
    }

    console.log(`Attempting to fetch and parse ID: ${id}`);
    const url = 'https://global.bookwalker.jp/' + id

    try {
        const response = await axios.get(url, {
            maxRedirects: 1,
        });

        if (response.status !== 200) {
            throw new Error(`Failed to retrieve the web page - got response code [${response.status}] for URL [${url}]`);
        }

        console.log('Successfully fetched URL. Loading with Cheerio...')
        const $ = cheerio.load(response.data)

        console.log(`Parsing page with ID: ${id}`)
        const parsedData = await bwg_parse_page($, id, isVolume)

        console.log('Parsing complete for ID: ${id}')
        const file_path = './data/manga_' + id + '.json'
        saveJsonToFileAsync(parsedData, file_path)
    } catch (error: any) {
        console.error('An error occurred during parsing:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.error(error); // Fallback for unexpected error types
        }
        process.exit(1);
    }
}

// Get the URL from command line arguments
const url = process.argv[2];
const isVol = process.argv[3] ? Boolean(Number(process.argv[3])) : true;
runParser(url, isVol);