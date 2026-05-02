import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCF-9zpC_Ma9aPOmRWdtRg5njYhWxqeZME",
    authDomain: "focusflow-f1ef5.firebaseapp.com",
    projectId: "focusflow-f1ef5",
    storageBucket: "focusflow-f1ef5.firebasestorage.app",
    messagingSenderId: "702851548659",
    appId: "1:702851548659:web:fe91d577b4014c6233fe86"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
