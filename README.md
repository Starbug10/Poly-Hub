# Poly-Hub

Functional Requirements:
-Configurable IP's for each user, including custom pre made profiles and automatic profile creation.
-Using Tailscale as the foundation it will bridge the connection between primarily 2 Pc's (up to *add amount tailscale can handle).
-Using tailscales built in send files function we will send files between 2 PCs.
-On each users pc during application setup they will dedicate a folder location which will be used with the file storage/sync function. 
-It will contain a folder on all users pc that will act as a central hub where all files sent between each other are stored and will be automatically updated and synced to everyone simultaneously. 
-It will have the ability to drag and drop files into the folder and the other users will instantly be able to see it in their respective folder locations.  

Non functional requirements:
-Latency
-Bandwidth and Size
-Lightweight
-Efficient/quick to use
-Easy to use
-Simple user interface for quick task completion


# possible tech stack
Electron/react for the app that has system level privilges that have safe guards to make sure no errors happen when files are being downloaded/copied and sent.

Connection to the tailscale layer (which will be configurable all through the electron app).

Built for windows first (other OS, since electron can support others, but support/testing for those will be limited).

Some of the features/workflows with this techstack will be:

Shortcut to pop up a thin modal at the top of the users screen where they can drag and drop files from their screen. This will then send into the 'shared libary' where both users can see inside of the apps libary.

This will have safe guarding itself to make sure users can send massive files repeadily or file sizes that would fills/almost fill the other users (one of the users) storage space as this will be shared. This will be changeable in settings to config per user, for example if a user with a large storage space as default settings to allow files aslong as it fits in the allocated space but the small storage space user wants to change that to something smaller like 10gb, if the file(s) exceed that, put a notifcation on the users screen of what the file is, the size and the overflow+allocated storage space it would be.

For visualises, since we are going with electron we have more freedom, it should follow these rules:

Typography: Ban Inter and system-ui. Use distinctive Serifs or technical Monospaces to add character.
Colour: Strictly no Purple/Indigo or linear blue gradients. Use OKLCH earth tones, "Safety Orange", or high-contrast monochrome.
Layout: Eliminate centered, rounded cards. Use sharp 0px corners, offset grids, and editorial magazine-style layouts.
Texture: Replace Gaussian blurs and "plastic" finishes with film grain, noise overlays, and 1px borders.
Visuals: Hard ban on emojis and 3D clay icons. Use lo-fi textures, custom SVG line art, or raw photography.
Shadows: Replace soft "glow" shadows with hard, offset "Brutalist" shadows.
Motion: Avoid generic fades. Use staggered reveals and kinetic, scroll-triggered typography.



Promt: "take a look at the readme.md file and asses the viability of this project, its ability to be easily configurable to new users (onboarding), and logic wise with the features/workflows set so far"