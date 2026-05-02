import {
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const authForm = document.getElementById("authForm");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authTitle = document.getElementById("authTitle");
const authSubmitButton = document.getElementById("authSubmitButton");
const authStatusMessage = document.getElementById("authStatusMessage");
const showSignInButton = document.getElementById("showSignInButton");
const showSignUpButton = document.getElementById("showSignUpButton");
const googleSignInButton = document.getElementById("googleSignInButton");

let authMode = "signin";

showSignInButton.addEventListener("click", () => setAuthMode("signin"));
showSignUpButton.addEventListener("click", () => setAuthMode("signup"));
authForm.addEventListener("submit", handleEmailAuth);
googleSignInButton.addEventListener("click", handleGoogleAuth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.replace("/app.html");
    }
});

setAuthMode("signin");

function setAuthMode(mode) {
    authMode = mode;
    const isSignUp = mode === "signup";

    nameInput.classList.toggle("hidden", !isSignUp);
    nameInput.required = isSignUp;
    showSignInButton.classList.toggle("active", !isSignUp);
    showSignUpButton.classList.toggle("active", isSignUp);
    authTitle.textContent = isSignUp ? "Create your FocusFlow account" : "Access your dashboard";
    authSubmitButton.textContent = isSignUp ? "Create Account" : "Sign In";
    authStatusMessage.textContent = "";
    authStatusMessage.className = "status-message";
}

async function handleEmailAuth(event) {
    event.preventDefault();
    setBusyState(true);

    try {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (authMode === "signup") {
            const fullName = nameInput.value.trim();

            if (!fullName) {
                throw new Error("Please enter your full name.");
            }

            const credential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(credential.user, { displayName: fullName });
            await ensureUserProfile(credential.user, fullName);
            showAuthMessage("Account created. Redirecting...", "success");
        } else {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            await ensureUserProfile(credential.user, credential.user.displayName || "");
            showAuthMessage("Signed in successfully. Redirecting...", "success");
        }
    } catch (error) {
        showAuthMessage(readableAuthError(error), "error");
    } finally {
        setBusyState(false);
    }
}

async function handleGoogleAuth() {
    setBusyState(true);

    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        await ensureUserProfile(result.user, result.user.displayName || "");
        showAuthMessage("Google sign-in successful. Redirecting...", "success");
    } catch (error) {
        showAuthMessage(readableAuthError(error), "error");
    } finally {
        setBusyState(false);
    }
}

async function ensureUserProfile(user, fallbackName) {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    const existingData = userSnapshot.exists() ? userSnapshot.data() : null;

    await setDoc(
        userRef,
        {
            uid: user.uid,
            name: user.displayName || fallbackName || "FocusFlow User",
            email: user.email || "",
            photoURL: user.photoURL || "",
            updatedAt: serverTimestamp(),
            createdAt: existingData?.createdAt || serverTimestamp()
        },
        { merge: true }
    );
}

function setBusyState(isBusy) {
    authSubmitButton.disabled = isBusy;
    googleSignInButton.disabled = isBusy;
    showSignInButton.disabled = isBusy;
    showSignUpButton.disabled = isBusy;
}

function showAuthMessage(message, type) {
    authStatusMessage.textContent = message;
    authStatusMessage.className = `status-message ${type}`;
}

function readableAuthError(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "This email is already in use.";
        case "auth/invalid-email":
            return "Please enter a valid email address.";
        case "auth/weak-password":
            return "Password should be at least 6 characters.";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Email or password is incorrect.";
        case "auth/popup-closed-by-user":
            return "Google sign-in was closed before it finished.";
        case "auth/unauthorized-domain":
            return "Add this domain in Firebase Authentication authorized domains.";
        default:
            return error.message || "Authentication failed. Please try again.";
    }
}
