<?php
  /*
    * Plugin Name:       Grid With Large Round Images
    * Version:           4.1.8
    * Author:            Html to Gutenberg
    * Author URI:        https://www.html-to-gutenberg.io/
    * Description:       A custom editable block built with Html to Gutenberg

  */

  if ( ! defined( 'ABSPATH' ) ) {
    exit;
  }

  function parse_form_placeholders_funcoem($content, $post_data)
  {
    return preg_replace_callback('/{{(.*?)}}/', function ($matches) use ($post_data) {
      $key = trim($matches[1]);
      return isset($post_data[$key]) ? sanitize_text_field($post_data[$key]) : '';
    }, $content);
  }

  add_action('wp_ajax_send_test_email_funcoem}', function() {
    //check_ajax_referer('wp_rest');

    $post_data = $_POST;
    $to = sanitize_email(parse_form_placeholders_funcoem($post_data['to'], $post_data));
    $from = sanitize_email(parse_form_placeholders_funcoem($post_data['from'], $post_data));
    $subject = sanitize_text_field(parse_form_placeholders_funcoem($post_data['subject'], $post_data));
    $message = wp_kses_post(parse_form_placeholders_funcoem($post_data['message'], $post_data));

    if (empty($to) || empty($from)) {
      wp_send_json_error('Missing email addresses.');
    }

    $sent = wp_mail($to, $subject, $message, [
      'Content-Type: text/html; charset=UTF-8',
      'From: ' . $from
    ]);

    if ($sent) {
      wp_send_json_success('Email sent');
    } else {
      error_log('Failed to send. To: ' . $to . ' | From: ' . $from);
      wp_send_json_error('Failed to send email.');
    }
  });  

  

  function funcoemwp_grid_with_large_round_images_add_custom_editor_styles() {
    echo '<style>span.block-editor-rich-text__editable.rich-text{all:unset!important}a br[data-rich-text-line-break=true],span.block-editor-block-icon.block-editor-block-switcher__toggle.has-colors img{display:none}.block-editor-block-types-list__list-item{width:100%!important}.block-editor-block-list__layout.is-root-container>:where(:not(.alignleft):not(.alignright):not(.alignfull)){max-width:100%;margin:0}[aria-label="Empty block; start writing or type forward slash to choose a block"]{max-width:1200px!important}span.block-editor-block-types-list__item-icon img{max-width:100%;width:100%;margin:0;display:block}span.block-editor-block-icon.has-colors{all:inherit;order:2;flex:0 0 100%;width:100%}span.block-editor-block-icon.has-colors svg{margin-left:auto;margin-right:auto}.block-editor-block-card{display:flex!important;flex-wrap:wrap}.block-editor-inserter__preview-content-missing{display:none!important}</style>';
  }

  add_action('admin_footer', function () {
    $screen = get_current_screen();
    
    if ($screen && method_exists($screen, 'is_block_editor') && $screen->is_block_editor()) {
        $href = esc_url(plugins_url('editor.css', __FILE__));
        echo "<link rel='stylesheet' id='wp-grid-with-large-round-images-style' href='$href' type='text/css' media='all' />";
    }
});

  add_action( 'enqueue_block_editor_assets', 'funcoemwp_grid_with_large_round_images_editor_assets' );

  add_action('wp_enqueue_scripts', function() {
      wp_dequeue_style('wp-fonts-local');
      wp_deregister_style('wp-fonts-local');
      wp_dequeue_style('global-styles');
      wp_deregister_style('global-styles');
      remove_action('wp_footer', 'wp_global_styles_render_svg_filters');
  }, 100);

  function funcoemwp_grid_with_large_round_images_editor_assets() {
    $filepath = plugin_dir_path(__FILE__) . 'block.js';
    $version = file_exists($filepath) ? filemtime($filepath) : time();

    wp_enqueue_script(
      'wp-grid-with-large-round-images',
      plugins_url( 'block.js', __FILE__ ),
      array( 'wp-blocks', 'wp-components', 'wp-element' ,'wp-editor'),
      $version
    );

    wp_localize_script( 'wp-grid-with-large-round-images', 'vars', array( 'url' => plugin_dir_url( __FILE__ ) ) );

    

    funcoemwp_grid_with_large_round_images_add_custom_editor_styles();

    wp_dequeue_style('wp-grid-with-large-round-images-frontend');
    wp_deregister_style('wp-grid-with-large-round-images-frontend');

    wp_enqueue_script(
      'wp-grid-with-large-round-images-remote-loader',
      plugins_url('remote-loader.js', __FILE__),
      array(),
      null,
      true
    );

    wp_add_inline_script(
      'wp-grid-with-large-round-images-remote-loader',
      "var remoteUrls = [\"https://cdn.tailwindcss.com/3.4.16\"];(function loadScripts() {window._loadedRemoteScripts = window._loadedRemoteScripts || new Set();const style = document.createElement('style');remoteUrls.forEach((url) => {if (window._loadedRemoteScripts.has(url)) return;const script = document.createElement('script');script.src = url;document.head.appendChild(script);window._loadedRemoteScripts.add(url);});})();function forceTailwindUpdate(){let e=setInterval(()=>{if(\"undefined\"!=typeof tailwind){clearInterval(e);let n=document.documentElement.outerHTML;tailwind.config.content=[{raw:n,extension:\"html\"}]}},100)}forceTailwindUpdate();(()=>{if(window.__tailwindObserverActive)return;window.__tailwindObserverActive=!0;let e=new MutationObserver(()=>{let t=[...document.querySelectorAll(\"style\")].find(e=>e.innerText.includes(\"--tw-\"));t&&(document.body.appendChild(t),e.disconnect(),window.__tailwindObserverActive=!1)});e.observe(document.documentElement,{childList:!0,subtree:!0})})();"
    );
  }

  add_action('enqueue_block_editor_assets', function () {
    wp_dequeue_style('wp-block-library');
    wp_dequeue_style('wp-block-library-theme');
    wp_dequeue_style('wc-block-style');
    wp_dequeue_style('wp-format-library');
}, 100);


  add_action('init', function () {
    wp_register_script(
        'wp-grid-with-large-round-images-scripts',
        plugins_url('scripts.js', __FILE__),
        array(),
        null,
        true
    );

    wp_register_style(
      'wp-grid-with-large-round-images-frontend',
      plugins_url('style.css', __FILE__)
    );

    wp_register_script(
      'wp-grid-with-large-round-images-remote-loader',
        plugins_url('remote-loader.js', __FILE__),
        array(),
        null,
        true
    );
  });

  add_action( 'wp_enqueue_scripts', 'funcoemwp_grid_with_large_round_images_block_assets', 999 );

  function funcoemwp_grid_with_large_round_images_block_assets() {
    global $wp_query;

    $used = false;

    if (!empty($wp_query->posts)) {
        foreach ($wp_query->posts as $post) {
            $blocks = parse_blocks($post->post_content);

            foreach ($blocks as $block) {
                if ($block['blockName'] === 'wp/gridwithlargeroundimages') {
                    $used = true;
                    break 2;
                }
            }
        }
    }

    if ($used) {
        $handle = 'wp-grid-with-large-round-images';

        wp_enqueue_style($handle . '-frontend');

        wp_enqueue_script($handle . '-scripts');

        wp_localize_script(
            $handle . '-scripts',
            'vars',
            array(
                'postId' => get_queried_object_id(),
                'ajaxUrl' => admin_url('admin-ajax.php')
            )
        );

        wp_enqueue_script($handle . '-remote-loader');

        wp_add_inline_script(
            $handle . '-remote-loader',
            "var remoteUrls = [\"https://cdn.tailwindcss.com/3.4.16\"];(function loadScripts() {window._loadedRemoteScripts = window._loadedRemoteScripts || new Set();const style = document.createElement('style');remoteUrls.forEach((url) => {if (window._loadedRemoteScripts.has(url)) return;const script = document.createElement('script');script.src = url;document.head.appendChild(script);window._loadedRemoteScripts.add(url);});})();function forceTailwindUpdate(){let e=setInterval(()=>{if(\"undefined\"!=typeof tailwind){clearInterval(e);let n=document.documentElement.outerHTML;tailwind.config.content=[{raw:n,extension:\"html\"}]}},100)}forceTailwindUpdate();(()=>{if(window.__tailwindObserverActive)return;window.__tailwindObserverActive=!0;let e=new MutationObserver(()=>{let t=[...document.querySelectorAll(\"style\")].find(e=>e.innerText.includes(\"--tw-\"));t&&(document.body.appendChild(t),e.disconnect(),window.__tailwindObserverActive=!1)});e.observe(document.documentElement,{childList:!0,subtree:!0})})();"
        );
    }
  }
  