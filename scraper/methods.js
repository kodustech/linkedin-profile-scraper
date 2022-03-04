require("dotenv").config();
const puppeteer = require("puppeteer");
const {
  getDurationInDays,
  formatDate,
  getCleanText,
  getLocationFromText,
  isPeriod,
  returnDetailsByExperience,
  academicExperienceIsValid
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
    await page.exposeFunction("returnDetailsByExperience", returnDetailsByExperience);
    await page.exposeFunction("academicExperienceIsValid", academicExperienceIsValid);
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

    /**
     * Retorno da lista de experiências profissionais, acadêmicas, competências
     */

    const { allExperiences, allEducations, allSkills, urlExperiences, urlEducations, urlSkills } = await page.$$eval(
      "main > section",
      async (nodes) => {

        const flowExperience = {
          openPageForMoreItems: ".pvs-list__outer-container .pvs-list__footer-wrapper a",
          getInternalListCards: ".pvs-entity > div > .pvs-list__outer-container > .pvs-list > li > .pvs-entity",
          getListCards: ".pvs-list__outer-container > .pvs-list > .artdeco-list__item",
          items: {
            title: ".pvs-list .pvs-entity div div div .t-bold span:nth-child(1)",
            listDetails: ".pvs-list .pvs-entity div div .t-normal",
            itemDetail: ".t-normal span:first-child",
            description: ".pvs-list .pvs-entity div .pvs-list__outer-container .pvs-list .pvs-list__item--with-top-padding span:first-child "
          }
        }

        let experienceArray = [];
        let educationArray = [];
        let skillsArray = [];


        /**
        * Candidato com muitas experiências
        */
        let urlExperiences = null;

        /**
        * Candidato com muitas experiências acadêmicas
        */
        let urlEducations = null;

        /**
        * Candidato com muitas experiências acadêmicas
        */
         let urlSkills = null;

        for (const node of nodes) {

          const experiences = node.querySelector("#experience")

          if (experiences) {

            /**
            * Possui um link para todas as experiências?
            */
            const allJobs = await node.querySelector(flowExperience.openPageForMoreItems);

            if (!allJobs) {

              const jobs = await Array.from(node.querySelectorAll(flowExperience.getListCards))

              for (const job of jobs) {

                const titleTopAux = job.querySelector(flowExperience.items.title);
                const titleTop = titleTopAux && titleTopAux.textContent ?
                  await window.getCleanText(titleTopAux.textContent) :
                  null;
                
                /**
                * Verificando se existe uma lista interna de experiências
                */
                const internalList = await Array.from(job.querySelectorAll(flowExperience.getInternalListCards));

                if (internalList && internalList.length > 0) {
                  for (const itemInternal of internalList) {
                    let arrayDetails = [];
                    const titleJob = itemInternal.querySelector(flowExperience.items.title);
                    const title = titleJob && titleJob.textContent ?
                      await window.getCleanText(titleJob.textContent) :
                      null;

                    if (title) {

                      for (let i = 2; i <= 4; i++) {
                        const item = itemInternal.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                        const itemSelected = item && item.querySelector(flowExperience.items.itemDetail) || null;
                        const itemText = itemSelected && itemSelected.textContent ?
                          await window.getCleanText(itemSelected.textContent) :
                          null;
                        if (itemText) {
                          arrayDetails.push(itemText);
                        }
                      }
      
                      const details = await returnDetailsByExperience('experience', arrayDetails);
      
                      const descriptionSpan = itemInternal.querySelector(flowExperience.items.description) || null;
                      const description = descriptionSpan && descriptionSpan.textContent ?
                        await window.getCleanText(descriptionSpan.textContent) :
                        null;

                      const { company, ...remaining } = details;
                      experienceArray.push({ company: titleTop, title, description: description || '' , ...remaining });
                    }
                  }
                } else {
                  /**
                  * Se não possui uma lista interna, pego as experiências normalmente
                  */
                  const titleJob = job.querySelector(flowExperience.items.title);
                  const title = titleJob && titleJob.textContent ?
                    await window.getCleanText(titleJob.textContent) :
                    null;

                  let arrayDetails = [];

                  if (title) {

                    for (let i = 2; i <= 4; i++) {
                      const item = job.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                      const itemSelected = item && item.querySelector(flowExperience.items.itemDetail) || null;
                      const itemText = itemSelected && itemSelected.textContent ?
                        await window.getCleanText(itemSelected.textContent) :
                        null;
                      if (itemText) {
                        arrayDetails.push(itemText);
                      }
                    }
    
                    const details = await returnDetailsByExperience('experience', arrayDetails);
    
                    const descriptionSpan = job.querySelector(flowExperience.items.description) || null;
                    const description = descriptionSpan && descriptionSpan.textContent ?
                      await window.getCleanText(descriptionSpan.textContent) :
                      null;

                    if(details){
                      experienceArray.push({ title, ...details, description: description || ''});
                    }
                  }
                }
              }
            } else {
            /**
            * Guardando o link com todas as experiências
            */
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
                    const item = institution.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                    const itemSelected = item && item.querySelector(flowExperience.items.itemDetail) || null;
                    const itemText = itemSelected && itemSelected.textContent ?
                      await window.getCleanText(itemSelected.textContent) :
                      null;
                    if (itemText) {
                      arrayDetails.push(itemText);
                    }
                  }
  
                  const details = await returnDetailsByExperience('education', arrayDetails);
  
                  const descriptionSpan = institution.querySelector(flowExperience.items.description) || null;
                  const description = descriptionSpan && descriptionSpan.textContent ?
                    await window.getCleanText(descriptionSpan.textContent) :
                    null;

                  if(details){
                    educationArray.push({ schoolName: title, ...details, fieldOfStudy: description || ''});
                  }
                }
              }
            } else {
              urlEducations = allEducation && allEducation.getAttribute("href") ? allEducation.getAttribute("href") : null;
            }
          }


          const skills = node.querySelector("#skills")
          if (skills) {
        
            const flowSkills = {
              getListCards: ".pvs-list__outer-container .pvs-list li .pvs-entity",
              title: ".pvs-entity div div div .t-bold span:nth-child(1)"
            }

            const allSkills = await node.querySelector(flowExperience.openPageForMoreItems);

            if (!allSkills) {

              const listSkills = await Array.from(node.querySelectorAll(flowSkills.getListCards));

              for (const skill of listSkills) {
                
                const titleskill = skill.querySelector(flowSkills.title);
                const title = titleskill && titleskill.textContent ?
                  await window.getCleanText(titleskill.textContent) :
                  null;
                if (title) {
                  skillsArray.push(title);
                }
              }
            } else {
              urlSkills = allSkills && allSkills.getAttribute("href") ? allSkills.getAttribute("href") : null;
            }
          }

          
        }

        return { allExperiences: experienceArray, allEducations: educationArray, allSkills: skillsArray, urlExperiences, urlEducations, urlSkills };
      }
    )

    return {
      userProfile,
      experiences: allExperiences,
      education: allEducations,
      skills: allSkills,
      urlExperiences,
      urlEducations,
      urlSkills
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

            const internalList = await Array.from(job.querySelectorAll(flowExperience.getInternalListCards));

            if (internalList && internalList.length > 0) {
              for (const itemInternal of internalList) {
                let arrayDetails = [];
                const titleJob = itemInternal.querySelector(flowExperience.items.title);
                const title = titleJob && titleJob.textContent ?
                  await window.getCleanText(titleJob.textContent) :
                  null;

                if (title) {

                  for (let i = 2; i <= 4; i++) {
                    const item = itemInternal.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                    const itemSelected = item && item.querySelector(flowExperience.items.itemDetail) || null;
                    const itemText = itemSelected && itemSelected.textContent ?
                      await window.getCleanText(itemSelected.textContent) :
                      null;
                    if (itemText) {
                      arrayDetails.push(itemText);
                    }
                  }

                  const details = await returnDetailsByExperience(type, arrayDetails);

                  const descriptionSpan = itemInternal.querySelector(flowExperience.items.description) || null;
                  const description = descriptionSpan && descriptionSpan.textContent ?
                    await window.getCleanText(descriptionSpan.textContent) :
                    null;

                    if(type === 'experience' && details){
                      const { company, ...remaining } = details;
                      allExpandedExperiences.push({ company: titleTop, title, description: description || '', ...remaining });
                    }else{
                      if(type === 'education'&& details){
                        allExpandedExperiences.push({ schoolName: title, ...details, fieldOfStudy: description || ''});
                      }
                    }
                }
              }

            } else {
              let arrayDetails = [];
              const titleJob = job.querySelector(flowExperience.items.title);
              const title = titleJob && titleJob.textContent ?
                await window.getCleanText(titleJob.textContent) :
                null;

              if (title) {

                for (let i = 2; i <= 4; i++) {
                  const item = job.querySelector(`${flowExperience.items.listDetails}:nth-child(${i})`) || null;
                  const itemSelected = item && item.querySelector(flowExperience.items.itemDetail) || null;
                  const itemText = itemSelected && itemSelected.textContent ?
                    await window.getCleanText(itemSelected.textContent) :
                    null;
                  if (itemText) {
                    arrayDetails.push(itemText);
                  }
                }

                const details = await returnDetailsByExperience(type, arrayDetails);

                const descriptionSpan = job.querySelector(flowExperience.items.description) || null;
                const description = descriptionSpan && descriptionSpan.textContent ?
                  await window.getCleanText(descriptionSpan.textContent) :
                  null;

                if(type === 'experience' && details){
                  allExpandedExperiences.push({ title, ...details, description: description || '' });
                }else{
                  if(type === 'education' && details){
                    allExpandedExperiences.push({ schoolName: title, ...details, fieldOfStudy: description || ''});
                  }
                }
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

const getAllSkills = async (page, url)=>{
  await page.goto(url);
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  
  try {
    return await page.$$eval(
      "main > section",
      async (nodes) => {

        let arraySkills = [];
        
        const flowSkills = {
          getListCards: ".artdeco-tabpanel .pvs-list__container div div .pvs-list > .pvs-list__paged-list-item",
          title: ".pvs-list__paged-list-item .pvs-entity div div a .t-bold span:nth-child(1)"
          
        }
        for(node of nodes){

          const listSkills = await Array.from(node.querySelectorAll(flowSkills.getListCards));
          for (const skill of listSkills) {
            const titleskill = skill.querySelector(flowSkills.title);
            const title = titleskill && titleskill.textContent ?
              await window.getCleanText(titleskill.textContent) :
              null;
            if (title) {
              arraySkills.push(title);
            }
          }
        }
        return arraySkills;
      })
  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  setup,
  getData,
  getAllExperiences,
  getAllSkills
};
