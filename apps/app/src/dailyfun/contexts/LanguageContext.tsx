import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface LanguageContextType {
  language: 'en' | 'de';
  primaryLanguage: 'en' | 'de';
  secondaryLanguage: 'en' | 'de';
  enabledLanguages: string[];
  toggleLanguage: () => void;
  setPrimaryLanguage: (lang: 'en' | 'de') => void;
  setSecondaryLanguage: (lang: 'en' | 'de') => void;
  setEnabledLanguages: (languages: string[]) => void;
  addEnabledLanguage: (language: string) => void;
  removeEnabledLanguage: (language: string) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation dictionary - this is a placeholder mechanism
const translations = {
  en: {
    // Header
    'header.home': 'Home',
    'header.search': 'Search',
    'header.about': 'About Us',
    'header.products': 'Products',
    'header.weird': 'Weird News',
    'header.translate': 'Translate',
    
    // Homepage
    'home.welcome': 'Welcome to Daily Fun',
    'home.tagline': 'Daily Fun: Make News Fun Again. Your daily dose of trustworthy entertainment.',
    'home.latest': 'Latest Articles',
    'home.random': 'Random Articles',
    'home.product.title': 'Our Latest Product',
    'home.product.description': 'Stay tuned for our exciting debut: a book full of entertaining facts!',
    'home.product.button': 'View Product',
    'home.goals.title': 'Our Goals',
    'home.goals.inspire': 'Inspire Millions',
    'home.goals.inspire.desc': 'Reach a vast audience with our unique blend of news.',
    'home.goals.laughter': 'Endless Laughter',
    'home.goals.laughter.desc': 'Create countless stories that bring joy and insight.',
    'home.goals.talent': 'Global Talent',
    'home.goals.talent.desc': 'Build a diverse team of comedic journalists worldwide.',
    'home.goals.fun': 'Uninterrupted Fun',
    'home.goals.fun.desc': 'Deliver entertaining and trustworthy content around the clock.',
    
    // Search Page
    'search.title': 'Search Articles',
    'search.placeholder': 'Search articles, authors, or topics...',
    'search.all': 'All Categories',
    'search.results': 'articles found',
    'search.results.for': 'for',
    'search.no.results': 'No articles found',
    'search.no.results.desc': 'Try adjusting your search terms or filters',
    'search.posts': 'Posts',
    'search.by': 'by',
    'search.no.author.articles': 'No articles by',
    'search.no.articles.available': 'No articles available.',
    
    // About Us Page
    'about.title': 'About Us',
    'about.subtitle': 'Get to know the team behind Daily Fun',
    'about.mission.title': 'Our Mission',
    'about.mission.desc': 'At Daily Fun, we believe news doesn\'t have to be boring. We\'re dedicated to bringing you reliable, entertaining content that keeps you informed while putting a smile on your face.',
    'about.team.title': 'Meet Our Team',
    'about.founder.name': 'Stefan Kunc',
    'about.founder.title': 'Founder & Editor-in-Chief',
    'about.founder.desc': 'Stefan founded Daily Fun with a vision to make news engaging and accessible to everyone.',
    'about.story.title': 'Our Story',
    'about.story.desc': 'Daily Fun was born from the idea that staying informed should be enjoyable. We combine journalistic integrity with a fresh, entertaining approach to bring you the news that matters.',
    
    // About Us Page - New translations
    'about.main.title': 'Welcome to Daily Fun – The Team Behind Your Daily Laughs!',
    'about.intro': 'In a world where news often feels overwhelming or depressing, Daily Fun steps in to change just that. We are your daily dose of trustworthy entertainment and absurd insights, proving that staying informed can actually be a blast!',
    'about.stefan.vision.title': 'Stefan Kunc\'s Vision',
    'about.stefan.vision.quote': '"As Stefan Kunc, I launched Daily Fun because I firmly believe that information doesn\'t have to be dry and tedious. My goal was to create a platform that masters the balance between serious reporting and genuine entertainment value – with a passionate and dedicated team."',
    'about.team.behind.title': 'The Team Behind Daily Fun',
    'about.team.intro': 'We are the faces behind Daily Fun – a creative and dedicated team working tirelessly every day to present the news to you with a wink. Our team spirit and shared vision drive us to create humorous yet trustworthy content. We combine human expertise with cutting-edge technology to offer you a unique perspective on global events.',
    'about.elke.name': 'Dr. Elke Schneider (AI)',
    'about.elke.role': 'Head of Humour & Creativity',
    'about.elke.desc': 'Elke is our master of good vibes. With her sharp mind and unparalleled wit, she ensures that every article and every video has that typical Daily Fun charm.',
    'about.karl.name': 'Mr. Karl Bergmann (AI)',
    'about.karl.role': 'Lead Story Weaver',
    'about.karl.desc': 'Karl is our fact-checker and storyteller all in one. He dives deep into subjects, packaging even complex topics into understandable, captivating, and often astonishing narratives.',
    'about.jonas.name': 'Mr. Jonas Richter (AI)',
    'about.jonas.role': 'Content Alchemist',
    'about.jonas.desc': 'Jonas transforms ideas into visual magic. Whether it\'s designing our videos or preparing infographics – he makes sure our content is not only funny but also visually impressive.',
    'about.values.title': 'Our Values',
    'about.values.subtitle': 'What Matters to Us',
    'about.values.desc': 'At Daily Fun, trust, humor, and innovation are at the core of everything we do. We deliver facts that are accurate, but in a way that brings joy. We are curious and, above all: never boring!',
    'about.join.title': 'Join the Daily Fun Family',
    'about.join.desc': 'Dive into the world of Daily Fun! Discover our latest articles and videos and follow us on social media so you don\'t miss a thing. We look forward to making you smile!',
    'about.explore.button': 'Explore Our Articles',
    'about.follow.button': 'Follow Us',
    
    // Products Page
    'products.title': 'Our Products',
    'products.subtitle': 'Discover our unique products full of humor and interesting facts.',
    'products.not.available': 'Not Yet Available',
    'products.category': 'Category:',
    'products.book': 'Book',
    'products.topic': 'Topic:',
    'products.facts': 'Facts',
    'products.pages': 'Pages:',
    'products.learn.more': 'Learn More',
    'products.coming.soon': 'Coming Soon',
    'products.coming.desc': 'We\'re working hard to soon present you with our first product. A book full of entertaining facts that brings Daily Fun directly to your home!',
    
    // Contact Page
    'contact.title': 'Contact Us',
    'contact.subtitle': 'Get in touch with us! We\'re here to help and answer any questions you might have.',
    'contact.german': 'For German Inquiries',
    'contact.english': 'For English Inquiries',
    'contact.love.to.hear': 'We\'d Love to Hear From You!',
    'contact.love.desc': 'Whether you have questions, feedback, or just want to say hello, don\'t hesitate to reach out. We typically respond within 24 hours.',
    
    // Social Media Page
    'social.title': 'Our YouTube Channels',
    'social.description': 'Follow us on our YouTube channels for daily entertainment and fun content!',
    'social.english.description': 'Our English channel featuring entertaining news and fun facts for global audiences.',
    'social.german.description': 'Our German channel with local humor and entertaining content for German-speaking viewers.',
    'social.visit.channel': 'Visit Channel',
    'social.stay.connected': 'Stay Connected',
    'social.stay.description': 'Don\'t miss out on our latest videos and updates. Subscribe to both channels for double the fun!',
    
    // Privacy Policy Page
    'privacy.title': 'Privacy Policy',
    'privacy.no.data': 'We do not collect any personal data.',
    'privacy.desc': 'Your privacy is important to us. We are committed to protecting your personal information and maintaining transparency about our data practices.',
    
    // Terms of Service Page
    'terms.title': 'Terms of Service',
    'terms.no.data': 'We do not collect any personal data.',
    'terms.desc': 'By using our service, you agree to our commitment to your privacy. We maintain a simple approach to data handling and user experience.',
    
    // Category Page
    'category.back': 'Back to Home',
    'category.articles': 'articles in this category',
    'category.no.articles': 'No articles found',
    'category.no.articles.desc': 'There are currently no articles in the',
    'category.not.found': 'Category Not Found',
    'category.return': 'Return to Home',
    
    // Footer
    'footer.quote': 'Delivering reliable news and engaging stories to keep you informed and entertained - because life\'s too short for boring headlines.',
    'footer.rights': '© 2024 Daily Fun. All rights reserved.',
    'footer.quick': 'Quick Links',
    'footer.categories': 'Fun Categories',
    
    // Common
    'common.back': 'Back',
    'common.contact': 'Contact',
    'common.privacy': 'Privacy Policy',
    'common.terms': 'Terms of Service',
    
    // Article Page
    'article.not.found': 'Article Not Found',
    'article.content.paragraph1': 'This remarkable story continues to unfold as our dedicated team of reporters investigates every angle. The implications of this development have sent ripples throughout the community, sparking conversations in coffee shops, social media, and dinner tables across the region.',
    'article.content.paragraph2': 'Local residents have been both amused and amazed by the turn of events. "I never thought I\'d see the day," commented one longtime community member. "But here we are, and honestly, it\'s exactly the kind of thing that makes life interesting."',
    'article.content.paragraph3': 'Our investigation revealed several fascinating details that shed light on how this situation came to be. Through extensive interviews and careful fact-checking, we\'ve pieced together a timeline that reads more like fiction than reality.',
    'article.content.paragraph4': 'As this story continues to develop, we\'ll be following up with all the key players involved. Stay tuned to Daily Fun for the latest updates on this and other stories that prove truth really is stranger than fiction.',
    
    // Article specific translations
    'article.1.title': 'Local Cat Elected as Honorary Mayor After Promising More Tuna for Everyone',
    'article.1.excerpt': 'In a stunning turn of events, Mr. Whiskers defeated all human candidates by a landslide margin of 12,000 votes. His campaign slogan "Purr-fect Leadership for a Purr-fect Tomorrow" resonated with voters across all demographics.',
    'article.2.title': 'Man Discovers His Grandmother\'s Secret Recipe Was Just Ketchup and Love',
    'article.2.excerpt': 'After 30 years of trying to recreate his beloved grandmother\'s "world-famous" pasta sauce, local resident discovers the ingredients were simpler than expected. "The love part was definitely the secret ingredient," he tearfully admitted.',
    'article.3.title': 'Tourist Gets Lost in Own Hotel, Discovers Secret Indoor Waterpark',
    'article.3.excerpt': 'What started as a simple search for the ice machine turned into the adventure of a lifetime. The lost tourist stumbled upon a hidden tropical paradise complete with slides, palm trees, and confused hotel staff.',
    'article.4.title': 'Local Comedy Club Bans Dad Jokes After Audience Groans Become Too Loud',
    'article.4.excerpt': 'The Laugh Track Comedy Club has implemented a strict "no puns, no dad jokes" policy after sound levels exceeded safety regulations. "We had to protect our patrons\' eardrums," said club owner. Emergency eye-roll stations have been installed.',
    'article.5.title': 'Weather Forecast Predicts 100% Chance of People Complaining About Weather',
    'article.5.excerpt': 'Meteorologists have made their most accurate prediction yet: regardless of actual weather conditions, citizens will find something to complain about. "It\'s either too hot, too cold, too wet, or too dry," reports chief meteorologist.',
    'article.6.title': 'Breaking: Dog Finally Catches Own Tail, Has No Idea What to Do Next',
    'article.6.excerpt': 'After three years of dedicated pursuit, Golden Retriever "Buddy" has achieved his life\'s ambition. Witnesses report the dog stood motionless for several minutes, apparently contemplating his next life goal. Squirrel-chasing is rumored to be next.',
    'article.7.title': 'Childhood 2.0: Where Cardboard Tubes Become Telescopes and Beds Become Trampolines',
    'article.7.excerpt': 'Ah, childhood! A time when reality was merely a suggestion and imagination was the only valid blueprint. Do you remember the other reality? The one our parents saw?',
    
    // Auth Page
    'auth.welcome': 'Welcome',
    'auth.subtitle': 'Sign in or create an account',
    'auth.login': 'Login',
    'auth.signup': 'Sign Up',
    'auth.email': 'Email',
    'auth.email.placeholder': 'your@email.com',
    'auth.password': 'Password',
    'auth.password.placeholder': '••••••••',
    'auth.login.button': 'Sign In',
    'auth.signup.button': 'Sign Up',
    'auth.or': 'Or continue with',
    'auth.google': 'Continue with Google',
    'auth.login.failed': 'Login failed',
    'auth.login.success': 'Successfully logged in',
    'auth.login.welcome': 'Welcome back!',
    'auth.signup.failed': 'Registration failed',
    'auth.signup.success': 'Registration successful',
    'auth.signup.email.verify': 'Please check your email for confirmation.',
    'auth.error': 'Error',
    'auth.error.unexpected': 'An unexpected error occurred.',
    
    // Profile Management Page
    'profile.live.preview': 'Live Preview',
    'profile.publish.article': 'Publish Article',
    'profile.edit.profile': 'Edit Profile',
  },
  de: {
    // Header
    'header.home': 'Startseite',
    'header.search': 'Suchen',
    'header.about': 'Über Uns',
    'header.products': 'Produkte',
    'header.weird': 'Seltsame Nachrichten',
    'header.translate': 'Übersetzen',
    
    // Homepage
    'home.welcome': 'Willkommen bei Daily Fun',
    'home.tagline': 'Daily Fun: Macht Nachrichten wieder Spaß. Ihre tägliche Dosis vertrauenswürdiger Unterhaltung.',
    'home.latest': 'Neueste Artikel',
    'home.random': 'Zufällige Artikel',
    'home.product.title': 'Unser neuestes Produkt',
    'home.product.description': 'Bleib dran für unser spannendes Debüt: ein Buch voller unterhaltsamer Fakten!',
    'home.product.button': 'Zum Produkt',
    'home.goals.title': 'Unsere Ziele',
    'home.goals.inspire': 'Millionen Inspirieren',
    'home.goals.inspire.desc': 'Eine große Zielgruppe mit unserer einzigartigen Nachrichtenmischung erreichen.',
    'home.goals.laughter': 'Endloses Lachen',
    'home.goals.laughter.desc': 'Unzählige Geschichten schaffen, die Freude und Einsicht bringen.',
    'home.goals.talent': 'Globales Talent',
    'home.goals.talent.desc': 'Ein vielfältiges Team von komödiantischen Journalisten weltweit aufbauen.',
    'home.goals.fun': 'Spaß',
    'home.goals.fun.desc': 'Unterhaltsame und vertrauenswürdige Inhalte rund um die Uhr liefern.',
    
    // Search Page
    'search.title': 'Artikel durchsuchen',
    'search.placeholder': 'Artikel, Autoren oder Themen suchen...',
    'search.all': 'Alle Kategorien',
    'search.results': 'Artikel gefunden',
    'search.results.for': 'für',
    'search.no.results': 'Keine Artikel gefunden',
    'search.no.results.desc': 'Versuchen Sie, Ihre Suchbegriffe oder Filter anzupassen',
    'search.posts': 'Beiträge',
    'search.by': 'von',
    'search.no.author.articles': 'Keine Artikel von',
    'search.no.articles.available': 'Keine Artikel verfügbar.',
    
    // About Us Page
    'about.title': 'Über Uns',
    'about.subtitle': 'Lernen Sie das Team hinter Daily Fun kennen',
    'about.mission.title': 'Unsere Mission',
    'about.mission.desc': 'Bei Daily Fun glauben wir, dass Nachrichten nicht langweilig sein müssen. Wir sind darauf spezialisiert, Ihnen zuverlässige, unterhaltsame Inhalte zu bringen, die Sie informiert halten und Ihnen ein Lächeln ins Gesicht zaubern.',
    'about.team.title': 'Unser Team',
    'about.founder.name': 'Stefan Kunc',
    'about.founder.title': 'Gründer & Chefredakteur',
    'about.founder.desc': 'Stefan gründete Daily Fun mit der Vision, Nachrichten für alle ansprechend und zugänglich zu machen.',
    'about.story.title': 'Unsere Geschichte',
    'about.story.desc': 'Daily Fun entstand aus der Idee, dass informiert bleiben Spaß machen sollte. Wir kombinieren journalistische Integrität mit einem frischen, unterhaltsamen Ansatz, um Ihnen die Nachrichten zu bringen, die wichtig sind.',
    
    // About Us Page - German translations
    'about.main.title': 'Willkommen bei Daily Fun – Das Team hinter Ihren täglichen Lachern!',
    'about.intro': 'In einer Welt, in der Nachrichten oft überwältigend oder deprimierend wirken, springt Daily Fun ein, um genau das zu ändern. Wir sind Ihre tägliche Dosis vertrauenswürdiger Unterhaltung und absurder Einblicke und beweisen, dass informiert bleiben tatsächlich ein Vergnügen sein kann!',
    'about.stefan.vision.title': 'Stefan Kuncs Vision',
    'about.stefan.vision.quote': '"Als Stefan Kunc habe ich Daily Fun gestartet, weil ich fest daran glaube, dass Informationen nicht trocken und langweilig sein müssen. Mein Ziel war es, eine Plattform zu schaffen, die das Gleichgewicht zwischen seriöser Berichterstattung und echtem Unterhaltungswert meistert – mit einem leidenschaftlichen und engagierten Team."',
    'about.team.behind.title': 'Das Team hinter Daily Fun',
    'about.team.intro': 'Wir sind die Gesichter hinter Daily Fun – ein kreatives und engagiertes Team, das jeden Tag unermüdlich daran arbeitet, Ihnen die Nachrichten mit einem Augenzwinkern zu präsentieren. Unser Teamgeist und unsere gemeinsame Vision treiben uns an, humorvolle und dennoch vertrauenswürdige Inhalte zu schaffen. Wir kombinieren menschliche Expertise mit modernster Technologie, um Ihnen eine einzigartige Perspektive auf das Weltgeschehen zu bieten.',
    'about.elke.name': 'Dr. Elke Schneider (KI)',
    'about.elke.role': 'Leiterin für Humor & Kreativität',
    'about.elke.desc': 'Elke ist unsere Meisterin der guten Stimmung. Mit ihrem scharfen Verstand und unvergleichlichem Witz sorgt sie dafür, dass jeder Artikel und jedes Video den typischen Daily Fun Charme hat.',
    'about.karl.name': 'Herr Karl Bergmann (KI)',
    'about.karl.role': 'Hauptgeschichtenerzähler',
    'about.karl.desc': 'Karl ist unser Faktenchecker und Geschichtenerzähler in einer Person. Er taucht tief in Themen ein und verpackt auch komplexe Themen in verständliche, fesselnde und oft erstaunliche Erzählungen.',
    'about.jonas.name': 'Herr Jonas Richter (KI)',
    'about.jonas.role': 'Content-Alchemist',
    'about.jonas.desc': 'Jonas verwandelt Ideen in visuelle Magie. Ob beim Gestalten unserer Videos oder beim Vorbereiten von Infografiken – er sorgt dafür, dass unsere Inhalte nicht nur lustig, sondern auch visuell beeindruckend sind.',
    'about.values.title': 'Unsere Werte',
    'about.values.subtitle': 'Was uns wichtig ist',
    'about.values.desc': 'Bei Daily Fun stehen Vertrauen, Humor und Innovation im Mittelpunkt von allem, was wir tun. Wir liefern Fakten, die genau sind, aber auf eine Art und Weise, die Freude bringt. Wir sind neugierig und vor allem: niemals langweilig!',
    'about.join.title': 'Treten Sie der Daily Fun Familie bei',
    'about.join.desc': 'Tauchen Sie ein in die Welt von Daily Fun! Entdecken Sie unsere neuesten Artikel und Videos und folgen Sie uns in den sozialen Medien, damit Sie nichts verpassen. Wir freuen uns darauf, Sie zum Lächeln zu bringen!',
    'about.explore.button': 'Unsere Artikel erkunden',
    'about.follow.button': 'Folgen Sie uns',
    
    // Products Page
    'products.title': 'Unsere Produkte',
    'products.subtitle': 'Entdecken Sie unsere einzigartigen Produkte voller Humor und interessanter Fakten.',
    'products.not.available': 'Noch nicht verfügbar',
    'products.category': 'Kategorie:',
    'products.book': 'Buch',
    'products.topic': 'Thema:',
    'products.facts': 'Fakten',
    'products.pages': 'Seiten:',
    'products.learn.more': 'Mehr erfahren',
    'products.coming.soon': 'Demnächst',
    'products.coming.desc': 'Wir arbeiten hart daran, Ihnen bald unser erstes Produkt zu präsentieren. Ein Buch voller unterhaltsamer Fakten, das Daily Fun direkt zu Ihnen nach Hause bringt!',
    
    // Contact Page
    'contact.title': 'Kontakt',
    'contact.subtitle': 'Kontaktieren Sie uns! Wir sind hier, um zu helfen und alle Ihre Fragen zu beantworten.',
    'contact.german': 'Für deutsche Anfragen',
    'contact.english': 'Für englische Anfragen',
    'contact.love.to.hear': 'Wir würden gerne von Ihnen hören!',
    'contact.love.desc': 'Egal ob Sie Fragen haben, Feedback geben möchten oder einfach nur hallo sagen wollen, zögern Sie nicht, uns zu kontaktieren. Wir antworten normalerweise innerhalb von 24 Stunden.',
    
    // Social Media Page
    'social.title': 'Unsere YouTube-Kanäle',
    'social.description': 'Folgen Sie uns auf unseren YouTube-Kanälen für tägliche Unterhaltung und lustige Inhalte!',
    'social.english.description': 'Unser englischer Kanal mit unterhaltsamen Nachrichten und lustigen Fakten für ein globales Publikum.',
    'social.german.description': 'Unser deutscher Kanal mit lokalem Humor und unterhaltsamen Inhalten für deutschsprachige Zuschauer.',
    'social.visit.channel': 'Kanal besuchen',
    'social.stay.connected': 'Bleiben Sie verbunden',
    'social.stay.description': 'Verpassen Sie nicht unsere neuesten Videos und Updates. Abonnieren Sie beide Kanäle für doppelten Spaß!',
    
    // Privacy Policy Page
    'privacy.title': 'Datenschutzrichtlinie',
    'privacy.no.data': 'Wir sammeln keine persönlichen Daten.',
    'privacy.desc': 'Ihr Datenschutz ist uns wichtig. Wir verpflichten uns, Ihre persönlichen Informationen zu schützen und Transparenz über unsere Datenpraktiken zu wahren.',
    
    // Terms of Service Page
    'terms.title': 'Nutzungsbedingungen',
    'terms.no.data': 'Wir sammeln keine persönlichen Daten.',
    'terms.desc': 'Durch die Nutzung unseres Services stimmen Sie unserem Engagement für Ihren Datenschutz zu. Wir verfolgen einen einfachen Ansatz beim Umgang mit Daten und der Benutzererfahrung.',
    
    // Category Page
    'category.back': 'Zurück zur Startseite',
    'category.articles': 'Artikel in dieser Kategorie',
    'category.no.articles': 'Keine Artikel gefunden',
    'category.no.articles.desc': 'Es gibt derzeit keine Artikel in der Kategorie',
    'category.not.found': 'Kategorie nicht gefunden',
    'category.return': 'Zur Startseite zurückkehren',
    
    // Footer
    'footer.quote': 'Zuverlässige Nachrichten und fesselnde Geschichten liefern, um Sie informiert und unterhalten zu halten - denn das Leben ist zu kurz für langweilige Schlagzeilen.',
    'footer.rights': '© 2024 Daily Fun. Alle Rechte vorbehalten.',
    'footer.quick': 'Schnelle Links',
    'footer.categories': 'Spaß Kategorien',
    
    // Common
    'common.back': 'Zurück',
    'common.contact': 'Kontakt',
    'common.privacy': 'Datenschutzrichtlinie',
    'common.terms': 'Nutzungsbedingungen',
    
    // Article Page
    'article.not.found': 'Artikel nicht gefunden',
    'article.content.paragraph1': 'Diese bemerkenswerte Geschichte entwickelt sich weiter, während unser engagiertes Reporterteam jeden Winkel untersucht. Die Auswirkungen dieser Entwicklung haben Wellen in der gesamten Gemeinde geschlagen und Gespräche in Cafés, sozialen Medien und an Esstischen in der ganzen Region ausgelöst.',
    'article.content.paragraph2': 'Die Anwohner waren sowohl amüsiert als auch erstaunt über die Wendung der Ereignisse. "Ich hätte nie gedacht, dass ich das noch erleben würde", kommentierte ein langjähriges Gemeinsmitglied. "Aber hier sind wir, und ehrlich gesagt ist es genau die Art von Sache, die das Leben interessant macht."',
    'article.content.paragraph3': 'Unsere Untersuchung ergab mehrere faszinierende Details, die Licht darauf werfen, wie diese Situation entstanden ist. Durch umfangreiche Interviews und sorgfältige Faktenprüfung haben wir eine Zeitleiste zusammengestellt, die eher wie Fiktion als Realität liest.',
    'article.content.paragraph4': 'Da sich diese Geschichte weiterentwickelt, werden wir alle wichtigen Akteure weiter verfolgen. Bleiben Sie bei Daily Fun für die neuesten Updates zu dieser und anderen Geschichten, die beweisen, dass die Wahrheit wirklich seltsamer ist als die Fiktion.',
    
    // Article specific translations - German
    'article.1.title': 'Lokale Katze zum Ehrenbürgermeister gewählt, nachdem sie mehr Thunfisch für alle versprach',
    'article.1.excerpt': 'In einer verblüffenden Wendung der Ereignisse besiegte Herr Whiskers alle menschlichen Kandidaten mit einem erdrutschartigen Vorsprung von 12.000 Stimmen. Sein Wahlslogan "Purr-fekte Führung für eine Purr-fekte Zukunft" fand bei Wählern aller demografischen Gruppen Anklang.',
    'article.2.title': 'Mann entdeckt, dass Großmutters Geheimrezept nur Ketchup und Liebe war',
    'article.2.excerpt': 'Nach 30 Jahren des Versuchs, die geliebte "weltberühmte" Nudelsauce seiner Großmutter nachzukochen, entdeckt ein Anwohner, dass die Zutaten einfacher waren als erwartet. "Der Liebesanteil war definitiv die Geheimzutat", gab er unter Tränen zu.',
    'article.3.title': 'Tourist verirrt sich im eigenen Hotel und entdeckt geheimen Indoor-Wasserpark',
    'article.3.excerpt': 'Was als einfache Suche nach der Eismaschine begann, wurde zum Abenteuer seines Lebens. Der verirrte Tourist stieß auf ein verstecktes tropisches Paradies mit Rutschen, Palmen und verwirrtem Hotelpersonal.',
    'article.4.title': 'Örtlicher Comedy-Club verbietet Vater-Witze, nachdem Publikums-Stöhnen zu laut wurde',
    'article.4.excerpt': 'Der Laugh Track Comedy Club hat eine strenge "Keine Wortspiele, keine Vater-Witze"-Richtlinie eingeführt, nachdem die Lautstärke die Sicherheitsvorschriften überschritt. "Wir mussten die Trommelfelle unserer Gäste schützen", sagte der Clubbesitzer. Notfall-Augenroll-Stationen wurden installiert.',
    'article.5.title': 'Wettervorhersage prognostiziert 100% Chance, dass Menschen über das Wetter klagen',
    'article.5.excerpt': 'Meteorologen haben ihre bisher genaueste Vorhersage gemacht: Unabhängig von den tatsächlichen Wetterbedingungen werden Bürger etwas zum Beklagen finden. "Es ist entweder zu heiß, zu kalt, zu nass oder zu trocken", berichtet der Chefmeteorologe.',
    'article.6.title': 'Eilmeldung: Hund fängt endlich seinen eigenen Schwanz, hat keine Ahnung was als nächstes zu tun ist',
    'article.6.excerpt': 'Nach drei Jahren hingebungsvoller Verfolgung hat Golden Retriever "Buddy" sein Lebensziel erreicht. Zeugen berichten, dass der Hund mehrere Minuten regungslos dastand und offenbar über sein nächstes Lebensziel nachdachte. Eichhörnchen-Jagen soll als nächstes kommen.',
    'article.7.title': 'Kindheit 2.0: Wo Papprollen zu Fernrohren werden und Betten zu Trampolinen',
    'article.7.excerpt': 'Ah, die Kindheit! Eine Zeit, in der die Realität eine reine Empfehlung war und die Fantasie der einzige gültige Bauplan. Erinnern Sie sich noch an die andere Realität? Die, die unsere Eltern sahen?',
    
    // Auth Page
    'auth.welcome': 'Willkommen',
    'auth.subtitle': 'Melden Sie sich an oder erstellen Sie ein Konto',
    'auth.login': 'Anmelden',
    'auth.signup': 'Registrieren',
    'auth.email': 'E-Mail',
    'auth.email.placeholder': 'ihre@email.de',
    'auth.password': 'Passwort',
    'auth.password.placeholder': '••••••••',
    'auth.login.button': 'Anmelden',
    'auth.signup.button': 'Registrieren',
    'auth.or': 'Oder weiter mit',
    'auth.google': 'Mit Google fortfahren',
    'auth.login.failed': 'Anmeldung fehlgeschlagen',
    'auth.login.success': 'Erfolgreich angemeldet',
    'auth.login.welcome': 'Willkommen zurück!',
    'auth.signup.failed': 'Registrierung fehlgeschlagen',
    'auth.signup.success': 'Registrierung erfolgreich',
    'auth.signup.email.verify': 'Bitte überprüfen Sie Ihre E-Mail für die Bestätigung.',
    'auth.error': 'Fehler',
    'auth.error.unexpected': 'Ein unerwarteter Fehler ist aufgetreten.',
    
    // Profile Management Page
    'profile.live.preview': 'Live Vorschau',
    'profile.publish.article': 'Artikel veröffentlichen',
    'profile.edit.profile': 'Profil bearbeiten',
  }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [primaryLanguage, setPrimaryLanguage] = useState<'en' | 'de'>(() => {
    const saved = localStorage.getItem('daily-fun-primary-language');
    return (saved as 'en' | 'de') || 'en';
  });
  
  const [secondaryLanguage, setSecondaryLanguage] = useState<'en' | 'de'>(() => {
    const saved = localStorage.getItem('daily-fun-secondary-language');
    return (saved as 'en' | 'de') || 'de';
  });

  const [enabledLanguages, setEnabledLanguagesState] = useState<string[]>(() => {
    const saved = localStorage.getItem('daily-fun-enabled-languages');
    return saved ? JSON.parse(saved) : ['en', 'de'];
  });

  const [language, setLanguage] = useState<'en' | 'de'>(primaryLanguage);

  // Always start with primary language on page load
  useEffect(() => {
    setLanguage(primaryLanguage);
  }, [primaryLanguage]);

  // Save language preferences whenever they change
  useEffect(() => {
    localStorage.setItem('daily-fun-language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('daily-fun-primary-language', primaryLanguage);
  }, [primaryLanguage]);

  useEffect(() => {
    localStorage.setItem('daily-fun-secondary-language', secondaryLanguage);
  }, [secondaryLanguage]);

  useEffect(() => {
    localStorage.setItem('daily-fun-enabled-languages', JSON.stringify(enabledLanguages));
  }, [enabledLanguages]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === primaryLanguage ? secondaryLanguage : primaryLanguage);
  };

  const handleSetPrimaryLanguage = (lang: 'en' | 'de') => {
    setPrimaryLanguage(lang);
    setLanguage(lang);
    // If secondary is same as new primary, swap them
    if (secondaryLanguage === lang) {
      setSecondaryLanguage(lang === 'en' ? 'de' : 'en');
    }
  };

  const handleSetSecondaryLanguage = (lang: 'en' | 'de') => {
    setSecondaryLanguage(lang);
    // If primary is same as new secondary, swap them
    if (primaryLanguage === lang) {
      setPrimaryLanguage(lang === 'en' ? 'de' : 'en');
      setLanguage(lang === 'en' ? 'de' : 'en');
    }
  };

  const setEnabledLanguages = (languages: string[]) => {
    setEnabledLanguagesState(languages);
  };

  const addEnabledLanguage = (lang: string) => {
    if (!enabledLanguages.includes(lang)) {
      setEnabledLanguagesState([...enabledLanguages, lang]);
    }
  };

  const removeEnabledLanguage = (lang: string) => {
    // Always keep at least one language enabled
    if (enabledLanguages.length > 1) {
      setEnabledLanguagesState(enabledLanguages.filter(l => l !== lang));
    }
  };

  // Translation function - returns the translated text or the key if not found
  const t = (key: string):string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      primaryLanguage, 
      secondaryLanguage, 
      enabledLanguages,
      toggleLanguage, 
      setPrimaryLanguage: handleSetPrimaryLanguage,
      setSecondaryLanguage: handleSetSecondaryLanguage,
      setEnabledLanguages,
      addEnabledLanguage,
      removeEnabledLanguage,
      t 
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
