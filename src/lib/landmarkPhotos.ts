// Real photos for well-known Dubai tourism landmarks, keyed by the place name in
// the `tourism` table. Used as the map marker's thumbnail when a place has no
// image of its own. Sources are Wikipedia/Wikimedia article lead images.
// A place not listed here (or a URL that fails to load) falls back to the
// category emoji.
export const LANDMARK_PHOTOS: Record<string, string> = {
  "Burj Khalifa":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Burj_Khalifa_%28worlds_tallest_building%29_and_the_Dubai_skyline_%2825781049892%29.jpg/330px-Burj_Khalifa_%28worlds_tallest_building%29_and_the_Dubai_skyline_%2825781049892%29.jpg",
  "The Dubai Mall":
    "https://upload.wikimedia.org/wikipedia/en/thumb/d/df/Dubai_Mall_10.jpg/330px-Dubai_Mall_10.jpg",
  "The Dubai Fountain":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Dubai_Fountain.jpg/330px-Dubai_Fountain.jpg",
  "Burj Al Arab":
    "https://upload.wikimedia.org/wikipedia/en/thumb/2/2a/Burj_Al_Arab%2C_Dubai%2C_by_Joi_Ito_Dec2007.jpg/330px-Burj_Al_Arab%2C_Dubai%2C_by_Joi_Ito_Dec2007.jpg",
  "Palm Jumeirah":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Artificial_Archipelagos%2C_Dubai%2C_United_Arab_Emirates_ISS022-E-024940_lrg_%28cropped%29.jpg/330px-Artificial_Archipelagos%2C_Dubai%2C_United_Arab_Emirates_ISS022-E-024940_lrg_%28cropped%29.jpg",
  "Atlantis The Palm":
    "https://upload.wikimedia.org/wikipedia/en/thumb/f/f3/Hotel_Atlantis_at_Sunset%2C_The_Palm_-_Dubai_%2849510861268%29.jpg/330px-Hotel_Atlantis_at_Sunset%2C_The_Palm_-_Dubai_%2849510861268%29.jpg",
  "Dubai Marina":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Dubai_Marina_Skyline.jpg/330px-Dubai_Marina_Skyline.jpg",
  "JBR Beach":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Dubai_Jumeirah_Beach.JPG/330px-Dubai_Jumeirah_Beach.JPG",
  "Ain Dubai":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/2022_Ain_Dubai_6_%2851824167326%29.jpg/330px-2022_Ain_Dubai_6_%2851824167326%29.jpg",
  "Museum of the Future":
    "https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/Museum_of_the_future%2C_Dubai.jpeg/330px-Museum_of_the_future%2C_Dubai.jpeg",
  "Dubai Frame":
    "https://upload.wikimedia.org/wikipedia/en/6/66/Dubai_Frame_Logo.jpg",
  "Global Village":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Global_village_Dubai6.jpg/330px-Global_village_Dubai6.jpg",
  "Dubai Miracle Garden":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Miracle_Garden_1.jpg/330px-Miracle_Garden_1.jpg",
  "Ski Dubai":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Ski_Dubai_-_Outside_View.jpg/330px-Ski_Dubai_-_Outside_View.jpg",
  "IMG Worlds of Adventure":
    "https://upload.wikimedia.org/wikipedia/en/4/41/IMG_Worlds_of_Adventure.png",
  "Dubai Creek":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/The_view_of_Dubai_Creek.jpg/330px-The_view_of_Dubai_Creek.jpg",
  "Jumeirah Mosque":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Jumeira_Mosque_Dubai.jpg/330px-Jumeira_Mosque_Dubai.jpg",
  "Dubai Opera":
    "https://upload.wikimedia.org/wikipedia/en/thumb/d/da/Dubai_Opera_Logo.png/330px-Dubai_Opera_Logo.png",
  "Wild Wadi Waterpark":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Wild-wadi.jpg/330px-Wild-wadi.jpg",
};
