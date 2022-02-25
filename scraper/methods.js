require("dotenv").config();
const puppeteer = require("puppeteer");
const {
  getDurationInDays,
  formatDate,
  getCleanText,
  getLocationFromText,
  isPeriod,
  returnDetailsByExperience
} = require("../utils");
const path = require("path");

const setup = async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      slowMo: 250,
      devtools: true,
      args: [
        // "--no-sandbox",
        // "--disable-setuid-sandbox",
        // "--proxy-server='direct://",
        // "--proxy-bypass-list=*",
        // "--disable-dev-shm-usage",
        // "--disable-accelerated-2d-canvas",
        // "--disable-gl-drawing-for-tests",
        // "--mute-audio",
      ],
    });

    const page = await browser.newPage();

    console.log("Adding helper methods to page");
    await page.exposeFunction("getCleanText", getCleanText);
    await page.exposeFunction("formatDate", formatDate);
    await page.exposeFunction("getDurationInDays", getDurationInDays);
    await page.exposeFunction("getLocationFromText", getLocationFromText);
    await page.exposeFunction("isPeriod", isPeriod);
    await page.exposeFunction("returnDetailsByExperience", returnDetailsByExperience)
    await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

    await page.setCookie({
      name: "li_at",
      value: process.env.LINKEDIN_SESSION_COOKIE_VALUE,
      domain: ".www.linkedin.com",
    });


    await page.goto('https://www.linkedin.com');

    return {
      page,
      browser,
    };
  } catch (error) {
    throw new Error(err);
  }
};

const getData = async (page, url) => {
  try {
    await page.goto(url);

    const expandButtonsSelectors = [
      ".pv-profile-section.pv-about-section .inline-show-more-text__button", // About
      "#experience-section .pv-profile-section__see-more-inline", // Experience
      ".pv-profile-section.education-section .pv-profile-section__see-more-inline", // Education
      ".pv-skill-categories-section .pv-profile-section__card-action-bar", // Skills
      ".pv-profile-section--certifications-section .pv-profile-section__see-more-inline", // certifications-section
    ];

    console.log('Expanding all sections by clicking their "See more" buttons');

    await page.waitForTimeout(1000);

    for (const buttonSelector of expandButtonsSelectors) {
      let button = await page.$(buttonSelector);

      console.log(buttonSelector, button !== null)

      if (button !== null) {
        console.log(`Clicking button ${buttonSelector}`);
        await button.evaluate(b => b.click());
      }
    }

    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

    /**
     * Informações iniciais do usuário
     */
    const userProfile = await page.evaluate(async () => {
      const profileSection = document.querySelector(".pv-top-card");

      const url = window.location.href;

      const fullNameElement = profileSection.querySelector(
        ".pv-text-details__left-panel h1"
      );
      const fullName =
        fullNameElement && fullNameElement.textContent ?
          await window.getCleanText(fullNameElement.textContent) :
          null;

      const titleElement = profileSection.querySelector(".ph5 .relative .pv-text-details__left-panel .text-body-medium");
      const title =
        titleElement && titleElement.textContent ?
          await window.getCleanText(titleElement.textContent) :
          null;

      const locationElement = profileSection.querySelector(
        ".ph5 .relative .pb2 .text-body-small"
      );
      const locationText =
        locationElement && locationElement.textContent ?
          await window.getCleanText(locationElement.textContent) :
          null;
      const location = await getLocationFromText(locationText);


      const photoElement =
        profileSection.querySelector(".pv-top-card-profile-picture__image");


      const photo =
        photoElement && photoElement.getAttribute("src") ?
          photoElement.getAttribute("src") :
          null;

      const descriptionElement = document.querySelector(
        ".artdeco-card .pv-shared-text-with-see-more"
      ); // Is outside "profileSection"
      const description =
        descriptionElement && descriptionElement.textContent ?
          await window.getCleanText(descriptionElement.textContent) :
          null;

      return {
        fullName,
        title,
        location,
        photo,
        description,
        url,
      };
    });

    const { allExperiences, allEducations, urlExperiences, urlEducations } = await page.$$eval(
      "main > section",
      async (nodes) => {

        const flowExperience = {
          openPageForMoreItems: ".pvs-list__outer-container .pvs-list__footer-wrapper a",
          getInternalListCards: ".pvs-entity > .pvs-list > li",
          getListCards: ".pvs-list__outer-container > .pvs-list > li",
          items: {
            title: ".pvs-list .pvs-entity div div div .t-bold span:nth-child(1)",
            listDetails: ".pvs-list .pvs-entity div div .t-normal",
            itemDetail: ".t-normal span:first-child",
            description: ".pvs-list .pvs-entity div .pvs-list__outer-container .pvs-list .pvs-list__item--with-top-padding span:first-child "
          }
        }

        let experienceArray = [];
        let educationArray = [];


        /**
        * Candidato com muitas experiências
        */
        let urlExperiences = null;

        /**
        * Candidato com muitas experiências acadêmicas
        */
        let urlEducations = null;
        for (const node of nodes) {

          const experiences = node.querySelector("#experience")

          if (experiences) {

            const allJobs = await node.querySelector(flowExperience.openPageForMoreItems);

            if (!allJobs) {

              const jobs = await Array.from(node.querySelectorAll(flowExperience.getListCards))

              for (const job of jobs) {

                const titleTopAux = job.querySelector(flowExperience.items.title);
                const titleTop = titleTopAux && titleTopAux.textContent ?
                  await window.getCleanText(titleTopAux.textContent) :
                  null;

                let internalListExperiences = [];

                const internalList = await Array.from(job.querySelectorAll(flowExperience.getInternalListCards));

                if (internalList.length > 0) {
                  for (const itemInternal of internalList) {
                    let arrayDetails = [];
                    const titleJob = itemInternal.querySelector(flowExperience.items.title);
                    const title = titleJob && titleJob.textContent ?
                      await window.getCleanText(titleJob.textContent) :
                      null;

                    if (title) {

                      for (let i = 2; i <= 4; i++) {
                        const item = itemInternal?.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                        const itemSelected = item?.querySelector(flowExperience.items.itemDetail) || null;
                        const itemText = itemSelected && itemSelected.textContent ?
                          await window.getCleanText(itemSelected.textContent) :
                          null;
                        if (itemText) {
                          arrayDetails.push(itemText);
                        }
                      }
      
                      const details = await returnDetailsByExperience('experience', arrayDetails);
      
                      const descriptionSpan = itemInternal?.querySelector(flowExperience.items.description) || null;
                      const description = descriptionSpan && descriptionSpan.textContent ?
                        await window.getCleanText(descriptionSpan.textContent) :
                        null;

                      internalListExperiences.push({ title, ...details, description });
                    }
                  }
                  experienceArray.push({ title: titleTop, allExperiences: internalListExperiences })
                } else {
                  const titleJob = job.querySelector(flowExperience.items.title);
                  const title = titleJob && titleJob.textContent ?
                    await window.getCleanText(titleJob.textContent) :
                    null;

                  let arrayDetails = [];

                  if (title) {

                    for (let i = 2; i <= 4; i++) {
                      const item = job?.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                      const itemSelected = item?.querySelector(flowExperience.items.itemDetail) || null;
                      const itemText = itemSelected && itemSelected.textContent ?
                        await window.getCleanText(itemSelected.textContent) :
                        null;
                      if (itemText) {
                        arrayDetails.push(itemText);
                      }
                    }
    
                    const details = await returnDetailsByExperience('experience', arrayDetails);
    
                    const descriptionSpan = job?.querySelector(flowExperience.items.description) || null;
                    const description = descriptionSpan && descriptionSpan.textContent ?
                      await window.getCleanText(descriptionSpan.textContent) :
                      null;

                    experienceArray.push({ title, ...details, description});
                  }
                }
              }
            } else {
              urlExperiences = allJobs && allJobs.getAttribute("href") ? allJobs.getAttribute("href") : null;
            }

          }

          const education = node.querySelector("#education")
          if (education) {

            const allEducation = await node.querySelector(flowExperience.openPageForMoreItems);

            if (!allEducation) {

              const institutions = await Array.from(node.querySelectorAll(flowExperience.getListCards));

              for (const institution of institutions) {
                let arrayDetails = [];
                const titleInstitution = institution.querySelector(flowExperience.items.title);
                const title = titleInstitution && titleInstitution.textContent ?
                  await window.getCleanText(titleInstitution.textContent) :
                  null;
                if (title) {

                  for (let i = 2; i <= 4; i++) {
                    const item = institution?.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                    const itemSelected = item?.querySelector(flowExperience.items.itemDetail) || null;
                    const itemText = itemSelected && itemSelected.textContent ?
                      await window.getCleanText(itemSelected.textContent) :
                      null;
                    if (itemText) {
                      arrayDetails.push(itemText);
                    }
                  }
  
                  const details = await returnDetailsByExperience('education', arrayDetails);
  
                  const descriptionSpan = institution?.querySelector(flowExperience.items.description) || null;
                  const description = descriptionSpan && descriptionSpan.textContent ?
                    await window.getCleanText(descriptionSpan.textContent) :
                    null;

                  educationArray.push({ title, ...details, description});
                }
              }
            } else {
              urlEducations = allEducation && allEducation.getAttribute("href") ? allEducation.getAttribute("href") : null;
            }
          }
        }

        return { allExperiences: experienceArray, allEducations: educationArray, urlExperiences, urlEducations };
      }
    )

    // const experiences = await page.$$eval(
    //   "#experience-section ul > .ember-view",
    //   async (nodes) => {
    //     let data = [];

    //     // Using a for loop so we can use await inside of it
    //     for (const node of nodes) {
    //       const titleElement = node.querySelector("h3");
    //       const title =
    //         titleElement && titleElement.textContent ?
    //           await window.getCleanText(titleElement.textContent) :
    //           null;

    //       const companyElement = node.querySelector(
    //         ".pv-entity__secondary-title"
    //       );
    //       const company =
    //         companyElement && companyElement.textContent ?
    //           await window.getCleanText(companyElement.textContent) :
    //           null;

    //       const descriptionElement = node.querySelector(
    //         ".pv-entity__description"
    //       );
    //       const description =
    //         descriptionElement && descriptionElement.textContent ?
    //           await window.getCleanText(descriptionElement.textContent) :
    //           null;

    //       const dateRangeElement = node.querySelector(
    //         ".pv-entity__date-range span:nth-child(2)"
    //       );
    //       const dateRangeText =
    //         dateRangeElement && dateRangeElement.textContent ?
    //           await window.getCleanText(dateRangeElement.textContent) :
    //           null;

    //       const startDatePart = dateRangeText ?
    //         await window.getCleanText(dateRangeText.split("–")[0]) :
    //         null;
    //       const startDate = startDatePart ? startDatePart : null;

    //       const endDatePart = dateRangeText ?
    //         await window.getCleanText(dateRangeText.split("–")[1]) :
    //         null;
    //       const endDateIsPresent = endDatePart ?
    //         endDatePart.trim().toLowerCase() === "o momento" :
    //         false;
    //       const endDate = endDatePart && !endDateIsPresent ? endDatePart : null;

    //       const durationInDaysWithEndDate =
    //         startDate && endDate && !endDateIsPresent ?
    //           await getDurationInDays(startDate, endDate) :
    //           null;
    //       const durationInDaysForPresentDate = endDateIsPresent ?
    //         await getDurationInDays(startDate, new Date()) :
    //         null;
    //       const durationInDays = endDateIsPresent ?
    //         durationInDaysForPresentDate :
    //         durationInDaysWithEndDate;

    //       const locationElement = node.querySelector(
    //         ".pv-entity__location span:nth-child(2)"
    //       );
    //       const locationText =
    //         locationElement && locationElement.textContent ?
    //           await window.getCleanText(locationElement.textContent) :
    //           null;
    //       const location = await getLocationFromText(locationText);

    //       data.push({
    //         title,
    //         company,
    //         location,
    //         startDate,
    //         endDate,
    //         endDateIsPresent,
    //         durationInDays,
    //         description,
    //       });
    //     }

    //     return data;
    //   }
    // );

    // const education = await page.$$eval(
    //   "#education-section ul > .ember-view",
    //   async (nodes) => {
    //     // Note: the $$eval context is the browser context.
    //     // So custom methods you define in this file are not available within this $$eval.
    //     let data = [];
    //     for (const node of nodes) {
    //       const schoolNameElement = node.querySelector(
    //         "h3.pv-entity__school-name"
    //       );
    //       const schoolName =
    //         schoolNameElement && schoolNameElement.textContent ?
    //           await window.getCleanText(schoolNameElement.textContent) :
    //           null;

    //       const degreeNameElement = node.querySelector(
    //         ".pv-entity__degree-name .pv-entity__comma-item"
    //       );
    //       const degreeName =
    //         degreeNameElement && degreeNameElement.textContent ?
    //           await window.getCleanText(degreeNameElement.textContent) :
    //           null;

    //       const fieldOfStudyElement = node.querySelector(
    //         ".pv-entity__fos .pv-entity__comma-item"
    //       );
    //       const fieldOfStudy =
    //         fieldOfStudyElement && fieldOfStudyElement.textContent ?
    //           await window.getCleanText(fieldOfStudyElement.textContent) :
    //           null;

    //       const gradeElement = node.querySelector(
    //         ".pv-entity__grade .pv-entity__comma-item"
    //       );
    //       const grade =
    //         gradeElement && gradeElement.textContent ?
    //           await window.getCleanText(fieldOfStudyElement.textContent) :
    //           null;

    //       const dateRangeElement = node.querySelectorAll(
    //         ".pv-entity__dates time"
    //       );

    //       const startDatePart =
    //         dateRangeElement &&
    //           dateRangeElement[0] &&
    //           dateRangeElement[0].textContent ?
    //           await window.getCleanText(dateRangeElement[0].textContent) :
    //           null;
    //       const startDate = startDatePart ?
    //         await formatDate(startDatePart) :
    //         null;

    //       const endDatePart =
    //         dateRangeElement &&
    //           dateRangeElement[1] &&
    //           dateRangeElement[1].textContent ?
    //           await window.getCleanText(dateRangeElement[1].textContent) :
    //           null;
    //       const endDate = endDatePart ? await formatDate(endDatePart) : null;

    //       // const durationInDays = (startDate && endDate) ? await getDurationInDays(startDate, endDate) : null

    //       data.push({
    //         schoolName,
    //         degreeName,
    //         fieldOfStudy,
    //         startDate,
    //         endDate,
    //         // durationInDays
    //       });
    //     }

    //     return data;
    //   }
    // );

    return {
      userProfile,
      experiences: allExperiences,
      education: allEducations,
      urlExperiences,
      urlEducations
    };
  } catch (error) {
    throw new Error(error);
  }
};

const getAllExperiences = async (type , page, url) => {
  await page.goto(url);
  await page.waitForTimeout(1000);

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  try {
    return await page.$$eval(
      "main > section",
      async (nodes, type) => {

        const flowExperience = {
          getListCards: ".pvs-list__container .scaffold-finite-scroll__content > .pvs-list > .pvs-list__item--line-separated",
          getInternalListCards: "li .pvs-entity div .pvs-list__outer-container .pvs-list li .pvs-list__container .scaffold-finite-scroll .scaffold-finite-scroll__content > .pvs-list > li",
          items: {
            title: "li .pvs-entity div div div .t-bold span:nth-child(1)",
            listDetails: ".pvs-list .pvs-entity div div .t-normal",
            itemDetail: ".t-normal span:first-child",
            description: ".pvs-list .pvs-entity div .pvs-list__outer-container .pvs-list .pvs-list__item--with-top-padding span:first-child "
          }
        }

        let allExpandedExperiences = [];
        for (const node of nodes) {

          const jobs = await Array.from(node.querySelectorAll(flowExperience.getListCards))

          for (const job of jobs) {

            const titleTopAux = job.querySelector(flowExperience.items.title);
            const titleTop = titleTopAux && titleTopAux.textContent ?
              await window.getCleanText(titleTopAux.textContent) :
              null;

            let internalListExperiences = [];

            const internalList = await Array.from(job.querySelectorAll(flowExperience.getInternalListCards));

            if (internalList.length > 0) {
              for (const itemInternal of internalList) {
                let arrayDetails = [];
                const titleJob = itemInternal.querySelector(flowExperience.items.title);
                const title = titleJob && titleJob.textContent ?
                  await window.getCleanText(titleJob.textContent) :
                  null;

                if (title) {

                  for (let i = 2; i <= 4; i++) {
                    const item = itemInternal?.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                    const itemSelected = item?.querySelector(flowExperience.items.itemDetail) || null;
                    const itemText = itemSelected && itemSelected.textContent ?
                      await window.getCleanText(itemSelected.textContent) :
                      null;
                    if (itemText) {
                      arrayDetails.push(itemText);
                    }
                  }

                  const details = await returnDetailsByExperience(type, arrayDetails);

                  const descriptionSpan = itemInternal?.querySelector(flowExperience.items.description) || null;
                  const description = descriptionSpan && descriptionSpan.textContent ?
                    await window.getCleanText(descriptionSpan.textContent) :
                    null;

                  internalListExperiences.push({ title, ...details, description });
                }
              }

              allExpandedExperiences.push({ title: titleTop, allExperiences: internalListExperiences })
            } else {
              let arrayDetails = [];
              const titleJob = job.querySelector(flowExperience.items.title);
              const title = titleJob && titleJob.textContent ?
                await window.getCleanText(titleJob.textContent) :
                null;

              if (title) {

                for (let i = 2; i <= 4; i++) {
                  const item = job?.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                  const itemSelected = item?.querySelector(flowExperience.items.itemDetail) || null;
                  const itemText = itemSelected && itemSelected.textContent ?
                    await window.getCleanText(itemSelected.textContent) :
                    null;
                  if (itemText) {
                    arrayDetails.push(itemText);
                  }
                }

                const details = await returnDetailsByExperience(type, arrayDetails);

                const descriptionSpan = job?.querySelector(flowExperience.items.description) || null;
                const description = descriptionSpan && descriptionSpan.textContent ?
                  await window.getCleanText(descriptionSpan.textContent) :
                  null;

                allExpandedExperiences.push({ title, ...details, description });
              }
            }
          }


        }

        return allExpandedExperiences;
      }, 
      type
    )

  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  setup,
  getData,
  getAllExperiences
};
