/* Agregá fotos, MP3 y PDF dentro de /assets/ y editá estas rutas. */
window.CARD_CONFIG = {
  grupos: [
    { nombre: 'Anime y manga', items: ['Spy × Family', 'Tokyo Ghoul', 'Fullmetal Alchemist: Brotherhood', 'Dreaming Freedom', 'True Beauty'] },
    { nombre: 'Videojuegos', items: ['Dark Souls', 'Hollow Knight', 'Pilgrammed', 'Deepwoken'] },
    { nombre: 'Música', items: ['Phyxinon', 'Miku Nakamura', 'Linyeras Cru', 'Cro', 'Oney1', 'Cerouno', 'Mitski', 'Zeballos', 'Mayo 214', 'Rocko'] },
    { nombre: 'Géneros', items: ['Hip hop / boom bap', 'Trap', 'Clásica', 'Rock latino', 'Rap', 'Pop'] },
    { nombre: 'Otros', items: ['Linux'] },
    { nombre: 'Colores', items: ['Beige', 'Azul pizarra', 'Rojo vino'] }
  ],
  colores: [
    {nombre:'Beige',hex:'#DED4BE',texto:'#352E29'},
    {nombre:'Azul pizarra',hex:'#202B39',texto:'#F0F0EC'},
    {nombre:'Rojo vino',hex:'#302127',texto:'#F0E9E9'}
  ],
  ambient: {
    wine: 'assets/ambiente-vino-inmediato.mp3',
    cream: 'assets/ambiente-amigos.mp3',
    blue: 'assets/ambiente-piano.mp3'
  },
  compositions: [
    {
      id: 'untitled-fantaisie',
      title: 'Untitled Fantaisie',
      cover: 'assets/untitled-fantaisie-portada.jpg',
      preview: 'assets/untitled-fantaisie-previa.mp3',
      scorePreview: 'assets/partitura-vista.png',
      score: 'assets/untitled-fantaisie.pdf',
      youtubeMusic: '' // agregá el enlace cuando lo tengas
    },
    {
      id: '5am', title: '5 am',
      cover: 'assets/5am-portada.jpg',
      preview: 'assets/5am-previa.mp3',
      scorePreview: 'assets/5am-partitura-vista.png',
      score: 'assets/5am.pdf',
      youtubeMusic: ''
    },
    {
      id: 'leia', title: 'Leia',
      cover: 'assets/leia-portada.jpg',
      preview: 'assets/leia-previa.mp3',
      scorePreview: 'assets/leia-partitura-vista.png',
      score: 'assets/leia.pdf',
      youtubeMusic: ''
    },
    {
      id: 'love-cliche', title: 'Love Cliche',
      cover: 'assets/love-cliche-portada.jpg',
      preview: 'assets/love-cliche-previa.mp3',
      scorePreview: 'assets/love-cliche-partitura-vista.png',
      score: 'assets/love-cliche.pdf',
      youtubeMusic: ''
    }
  ]
};
