import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, Browser, Page } from 'playwright';
import fs from 'nod:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

async function ensureDirectoryExists(directory: string) {
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${directory}:`, error);
  }
}

async function checkPlaywrightInstallation() {
  try {
    await import('playwright');
    console.log('Playwright is already installed.');
  } catch (error) {
    console.log('Playwright is not installed. Installing...');
    await execAsync('npm install playwright');
    console.log('Playwright installed successfully.');
  }
}

async function scrapeWebsite(url: string) {
  await checkPlaywrightInstallation();

  // Ensure required directories exist
  await ensureDirectoryExists('screenshots');
  await ensureDirectoryExists('data');

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  // Navigate to the website
  await page.goto(url);

  // Get all links on the page
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(link => link.getAttribute('href'));
  });

  // Recursively scrape each link
  for (const link of links) {
    if (link && !link.startsWith('http')) {
      const fullUrl = new URL(link, url).href;
      await scrapeRoute(fullUrl, page);
    }
  }

  await scrapeRoute(url, page); // Save the main page data and screenshot

  await browser.close();
}

async function scrapeRoute(url: string, page: Page) {
  try {
    // Navigate to the route
    await page.goto(url);

    // Take a screenshot of the page
    const screenshotPath = path.join('screenshots', `${url.replace(/[/\\?%*:|"<>]/g, '-')}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot for ${url} at ${screenshotPath}`);

    // Scrape data from the page
    const pageData = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content')
      };
    });

    // Save the page data to a file
    const dataPath = path.join('data', `${url.replace(/[/\\?%*:|"<>]/g, '-')}.json`);
    await fs.writeFile(dataPath, JSON.stringify(pageData, null, 2));
    console.log(`Saved page data for ${url} at ${dataPath}`);
  } catch (error) {
    if (error.message.includes('net::ERR_ABORTED')) {
      console.log(`Skipping ${url} due to navigation error.`);
    } else {
      console.error(`Error scraping ${url}:`, error);
    }
  }
}

// Example usage
scrapeWebsite('https://www.example.com/');