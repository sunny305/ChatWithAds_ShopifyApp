import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Chat With Ads</h1>
        <p className={styles.text}>
          Transform your product listings into engaging conversations that drive sales.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>AI-Powered Chat</strong>. Engage customers with intelligent conversations about your products, answering questions and providing personalized recommendations.
          </li>
          <li>
            <strong>Product Discovery</strong>. Help customers find exactly what they're looking for through natural conversation and smart product matching.
          </li>
          <li>
            <strong>Sales Optimization</strong>. Convert browsers into buyers with contextual product suggestions and real-time assistance throughout their shopping journey.
          </li>
        </ul>
      </div>
    </div>
  );
}
